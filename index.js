const GoogleCloudDatastore = require('@google-cloud/datastore');
const uuid = require('uuid-random');
const hasha = require('hasha');
const delay = require('delay');
const circular = require('circular-json');

const Datastore2 = (opts) => {
  const Datastore = new GoogleCloudDatastore(opts);

  const Key = (kind, keyName) => {
    keyName = String(keyName);
    return Datastore.key([kind, keyName]);
  };

  const TransactionLocks = [];

  class Transaction{
    constructor () {
      this.transaction = Datastore.transaction();
    }
    keys (keys) {
      this.keyPairs = Object.keys(keys).map((key) => [key, keys[key]]);
      return this;
    }
    exec (executorFn, maxAttempts) {
      const { transaction, keyPairs } = this;
      maxAttempts = (Boolean(maxAttempts) === true && typeof maxAttempts === 'number') ? maxAttempts : 500;
      let attempt = 1;
      const Rand = (min, max) => {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
      const hashesOfKeyPairs = keyPairs.map((keyPair) => {
        return hasha(
          ''.concat(keyPair[1].kind, keyPair[1].name),
          { algorithm: 'sha256' }
        );
      });
      const tryCommit = () => {
        let executorFnReject = false;
        // console.log(TransactionLocks);
        return Promise.resolve()
          .then(() => {
            let lockedHashFound = false;
            for (var i = 0; i < hashesOfKeyPairs.length; i++) {
              if (TransactionLocks.includes(hashesOfKeyPairs[i]) === true) {
                lockedHashFound = true;
                // console.log('stopped @', i + 1, 'of', hashesOfKeyPairs.length);
                break;
              }
            }
            if (lockedHashFound === true) {
              // console.log('lockedHashFound');
              return Promise.reject();
            } else {
              hashesOfKeyPairs.map((hash) => {
                // console.log('locking', hash);
                TransactionLocks.push(hash);
              });
              return Promise.resolve();
            }
          })
          .then(() => transaction.run())
          .then(() => Promise.all(keyPairs.map((keyPair) => transaction.get(keyPair[1]))))
          .then((results) => {
            let entities = {};
            keyPairs.map((keyPair, keyPairIndex) => {
              entities[keyPair[0]] = results[keyPairIndex][0];
            });
            return executorFn(entities)
              .catch((...args) => {
                executorFnReject = true;
                return Promise.reject.apply(Promise, args);
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
                  hashesOfKeyPairs.map((hash) => {
                    // console.log('unlocking', hash);
                    TransactionLocks.splice(TransactionLocks.indexOf(hash), 1);
                  });
                  return Promise.reject();
                });
          })
          .then(() => {
            // console.log('attempt success:', attempt);
            hashesOfKeyPairs.map((hash) => {
              // console.log('unlocking', hash);
              TransactionLocks.splice(TransactionLocks.indexOf(hash), 1);
            });
            return Promise.resolve();
          })
          .catch((...args) => {
            // console.log('attempt fail:', attempt);
            if (executorFnReject === true) {
              hashesOfKeyPairs.map((hash) => {
                // console.log('unlocking', hash);
                TransactionLocks.splice(TransactionLocks.indexOf(hash), 1);
              });
            }
            if (
              // attempt <= maxAttempts &&
              executorFnReject === false
            ) {
              // attempt = attempt + 1;
              return Promise.resolve()
                .then(delay(Rand(500, 1000)))
                .then(() => tryCommit());
            } else {
              return Promise.resolve()
                .then(() => transaction.rollback())
                .then(() => Promise.reject.apply(Promise, args));
            }
          });
      }
      return tryCommit();
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
              return recurse();
            } else {
              entities.temp = {};
              self.key = key;
              // console.log('resolving!');
              return Promise.resolve(entities);
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
        .exec((entities) => {
          entities.temp = updateData;
          return Promise.resolve(entities);
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
        .exec((entities) => {
          entities.temp = Object.assign(entities.temp, mergeData);
          return Promise.resolve(entities);
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
