const GoogleCloudDatastore = require('@google-cloud/datastore');
const uuid = require('uuid-random');
const RegExUUIDv4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const Datastore2 = (opts) => {
  const Datastore = new GoogleCloudDatastore(opts);

  const Key = (kind, keyName) => {
    keyName = String(keyName);
    return Datastore.key([kind, keyName]);
  };
  class Transaction{
    constructor () {
      this.transaction = Datastore.transaction();
    }
    keys (keys) {
      this.keyPairs = Object.keys(keys).map((key) => [key, keys[key]]);
      return this;
    }
    init (executorFn) {
      const { transaction, keyPairs } = this;
      const commit = (entities) => {
        const updateArray =  keyPairs.map((keyPair) => {
          return {
            key: keyPair[1],
            data: entities[keyPair[0]]
          };
        });
        transaction.save(updateArray);
        return transaction.commit().catch(() => transaction.rollback());
      };
      return transaction
        .run()
        .then(() => Promise.all(keyPairs.map((keyPair) => transaction.get(keyPair[1]))))
        .then((results) => {
          let entities = {};
          keyPairs.map((keyPair, keyPairIndex) => {
            entities[keyPair[0]] = results[keyPairIndex][0];
          });
          return executorFn(entities, commit);
        });
    }
  }

  class Query {
    constructor (kind, endCursor) {
      let query = Datastore.createQuery(kind);
      if (Boolean(endCursor) === true) {
        query = query.start(endCursor);
      }
      this._query = query;
    }
    ascend (col) {
      this._query = this._query.order(col);
      return this;
    }
    descend (col) {
      this._query = this._query.order(col, {
        descending: true,
      });
      return this;
    }
    select (fields) {
      this._query = this._query.select(fields);
      return this;
    }
    filter (col, operator, val) {
      this._query = this._query.filter(col, operator, val);
      return this;
    }
    limit (limit) {
      this._query = this._query.limit(limit);
      return this;
    }
    runQuery () {
      let query = this._query;
      return Datastore
        .runQuery(this._query)
        .then((results)=>{
          let entities = results[0];
          let keys = entities.map(entity => entity[Datastore.KEY]);
          let info = results[1];
          let endCursor = (
            info.moreResults !== Datastore.NO_MORE_RESULTS ?
            info.endCursor :
            null
          );
          return Promise.resolve({
            entities, keys, endCursor
          });
        });
    }
  };
  class Entity{
    setKind (kind) {
      if (Boolean(kind) === false) {
        return Promise.reject("Missing KIND param, setKind can't proceed.");
      }
      this.kind = kind;
      return this;
    }
    setKey (key) {
      if (Boolean(key) === false) {
        return Promise.reject("Missing KEY param, setKind can't proceed.");
      }
      this.key = key;
      this.kind = key.kind;
      return this;
    }
    fromUUID () {
      let self = this;
      let kind = this.kind;
      let key = this.key;
      if (Boolean(kind) === false) {
        return Promise.reject("Missing entity KIND, fromUUID can't proceed.");
      }
      if (Boolean(key) === true) {
        return Promise.reject("Entity KEY already exists, fromUUID can't proceed.");
      }
      const recurse = () => {
        key = Key(kind, uuid());
        return new Transaction()
          .keys({
            temp: key
          })
          .init((entities, commit) => {
            if (Boolean(entities.temp) === true) {
              return recurse();
            } else {
              entities.temp = {};
              self.key = key;
              return commit(entities);
            }
          });
      };
      return recurse();
    }
    fromFilters (...filters) {
      let self = this;
      let kind = this.kind;
      let key = this.key;
      if (Boolean(kind) === false) {
        return Promise.reject("Missing entity KIND, fromFilters can't proceed.");
      }
      if (Boolean(key) === true) {
        return Promise.reject("Entity KEY already exists, fromFilters can't proceed.");
      }
      let query = new Query(kind).limit(1);
      filters.map((filter) => query.filter(filter[0], filter[1], filter[2]));
      return query.runQuery()
        .then(({ entities, keys }) => {
          if (Boolean(entities[0]) === true) {
            self.key = keys[0];
            return Promise.resolve();
          } else {
            return Promise.reject("fromFilters error: Entity NOT FOUND.");
          }
        });
    }
    update (updateData) {
      let key = this.key;
      if (Boolean(key) === false) {
        return Promise.reject("Missing entity KEY, UPDATE can't proceed.");
      }
      return new Transaction()
        .keys({
          temp: key
        })
        .init((entities, commit) => {
          entities.temp = updateData;
          return commit(entities);
        });
    }
    merge (mergeData) {
      let key = this.key;
      if (Boolean(key) === false) {
        return Promise.reject("Missing entity KEY, MERGE can't proceed.");
      }
      return new Transaction()
        .keys({
          temp: key
        })
        .init((entities, commit) => {
          entities.temp = Object.assign(entities.temp, mergeData);
          return commit(entities);
        });
    }
    static fetch (keys) {
      return new Promise((resolve, reject) => {
        new Transaction()
          .keys(keys)
          .init(resolve)
          .catch(reject);
      });
    }
  }
  return {
    Transaction,
    Key,
    Entity,
    Query
  };
};
module.exports = Datastore2;
