const GCDatastore = require('@google-cloud/datastore');
const uuid        = require('uuid-random');
const hasha       = require('hasha');
const circular    = require('circular-json');
const Dreadlock   = require('dreadlocks2');
const Datastore2 = (opts) => {
  const Datastore = new GCDatastore(opts);

  const Key = (kind, keyName) => {
    keyName = String(keyName);
    return Datastore.key([kind, keyName]);
  };

  const Dread = new Dreadlock();
  class Transaction{
    constructor () {
      this.transaction = Datastore.transaction();
    }
    keys (keys) {
      this.keyPairs = Object.keys(keys).map((key) => [key, keys[key]]);
      return this;
    }
    exec (executorFn) {
      const { transaction, keyPairs } = this;
      if (Boolean(keyPairs) === false) {
        return Promise.reject("Transaction missing keys(), can't proceed.");
      } else {
        const keySet = keyPairs.map((keyPair) => {
          return hasha(
            ''.concat(keyPair[1].kind, keyPair[1].name),
            { algorithm: 'sha256' }
          );
        });
        return Promise.resolve()
          .then(() => Dread.lock(keySet))
          .then(() => transaction.run())
          .then(() => Promise.all(keyPairs.map((keyPair) => transaction.get(keyPair[1]))))
          .then((results) => {
            let entities = {};
            keyPairs.map((keyPair, keyPairIndex) => {
              entities[keyPair[0]] = results[keyPairIndex][0];
            });
            return executorFn(entities)
              .catch((...args) => {
                return Dread.release(keySet)
                  .then(() => Promise.reject.apply(Promise, args));
              });
          })
          .then((entities) => {
            const updateArray =  keyPairs.map((keyPair) => {
              return {
                key: keyPair[1],
                data: entities[keyPair[0]]
              };
            });
            transaction.save(updateArray);
            return transaction
              .commit()
              .catch(() => {
                return Dread.release(keySet)
                  .then(() => Promise.reject());
              });
          })
          .then(() => Dread.release(keySet))
          .catch((...args) => {
            return Promise.resolve()
              .then(() => transaction.rollback())
              .then(() => Promise.reject.apply(Promise, args));
          });
      }
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
    offset (val) {
      this._query = this._query.offset(val);
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
          let hash = hasha(
            circular.stringify(query),
            { algorithm: 'sha256' }
          );
          return Promise.resolve({
            entities, keys, endCursor, hash
          });
        });
    }
  };

  class Entity{
    useValidator (validatorFn) {
      this.validatorFn = validatorFn;
    }
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
          .exec((entities) => {
            if (Boolean(entities.temp) === true) {
              return Promise.reject();
            } else {
              entities.temp = {};
              self.key = key;
              return Promise.resolve(entities);
            }
          })
		  .catch(() => recurse());
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
      let validatorFn = this.validatorFn;
      if (Boolean(key) === false) {
        return Promise.reject("Missing entity KEY, UPDATE can't proceed.");
      }
      return Promise.resolve()
        .then(() => {
          if (Boolean(validatorFn) === true) {
            return validatorFn(updateData);
          } else {
            return Promise.resolve();
          }
        })
        .then(() => {
          return new Transaction()
            .keys({
              temp: key
            })
            .exec((entities) => {
              entities.temp = updateData;
              return Promise.resolve(entities);
            });
        });
    }
    merge (mergeData) {
      let key = this.key;
      let validatorFn = this.validatorFn;
      if (Boolean(key) === false) {
        return Promise.reject("Missing entity KEY, MERGE can't proceed.");
      }
      return Promise.resolve()
        .then(() => {
          if (Boolean(validatorFn) === true) {
            return validatorFn(mergeData);
          } else {
            return Promise.resolve();
          }
        })
        .then(() => {
          return new Transaction()
            .keys({
              temp: key
            })
            .exec((entities) => {
              entities.temp = Object.assign(entities.temp, mergeData);
              return Promise.resolve(entities);
            });
        });
    }
    delete () {
      let key = this.key;
      if (Boolean(key) === false) {
        return Promise.reject("Entity KEY missing, delete can't proceed.");
      }
      return Datastore.delete(key);
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
