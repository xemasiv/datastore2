const GCDatastore = require('@google-cloud/datastore');
const uuid        = require('uuid-random');
const hasha       = require('hasha');
const circular    = require('circular-json');
const Dreadlock   = require('dreadlocks2');

const DS2 = (opts, debug) => {

  const Datastore = new GCDatastore(opts);

  const log = Boolean(debug) === true ? console.log : () => {};

  const Key = (kind, keyName) => {
    if (typeof keyName === 'string' || typeof keyName === 'number') {
      keyName = String(keyName);
      return Datastore.key([kind, keyName]);
    }
    throw(new TypeError('EXPECTING string OR number AS KEY name OR id.'));
  };

  const Dread = new Dreadlock();

  class Transaction {
    constructor () {
      this.transaction = Datastore.transaction();
    }
    keys (keys) {
      this.keyPairs = Object.keys(keys).map((key) => [key, keys[key]]);
      return this;
    }
    exec (executorFn) {
      const { transaction, keyPairs } = this;
      let promise;

      if (Boolean(keyPairs) === false) {
        promise = Promise.reject('DS2 :: transaction missing keys, cannot proceed.');
        return promise;
      }

      /**
       * 
       * We hash using the following unique data:
       * - Entity's `namespace`
       * - Entity's `kind`
       * - Entity's `name` or `id`
       * 
       */
      const keySet = keyPairs.map((keyPair) => {
        return hasha(
          ''.concat(
            String(keyPair.namespace),
            String(keyPair[1].kind),
            String(keyPair[1].name || keyPair[1].id)
          ),
          { algorithm: 'sha256' }
        );
      });

      log(keySet);

      promise = Dread.lock(keySet)

        // Initialize transaction:
        .then(() => transaction.run())

        // Gather keys for transaction:
        .then(() => Promise.all(keyPairs.map((keyPair) => transaction.get(keyPair[1]))))

        // Pass what we got to our executor function:
        .then((results) => {

          let entities = {};
          keyPairs.map((keyPair, keyPairIndex) => {
            entities[keyPair[0]] = results[keyPairIndex][0];
          });

          let result;
          let error;
          try {
            result = executorFn(entities);
          } catch (e) {
            error = ''.concat(e.name, e.message);
          }

          log('DS2 :: typeof result:', typeof result);
          log('DS2 :: typeof error:', typeof error);
          log('DS2 :: ', { result, error});
          
          // Check for exceptions:
          if (Boolean(error) === true) {
            log('DS2 :: error, exception found in executor function.');
            return Promise.reject(error);
          }

          // Ensure our executor function returned a promise:
          if (Boolean(result.then) !== true || typeof result.then !== 'function') {
            log('DS2 :: error, expecting promise from executor function.');
            return Promise.reject('DS2 :: error, expecting promise from executor function.');
          }

          return result;
        })

        // Proceed if not rejected by developer:
        .then((entities) => {

          // Ensure our executor function passed a valid object:
          if (Boolean(entities) !== true || typeof entities !== 'object') {
            log('DS2 :: error, expecting object from executor function promise.');
            return Promise.reject('DS2 :: error, expecting object from executor function promise.');
          }

          const updateArray =  keyPairs.map((keyPair) => {
            return {
              key: keyPair[1],
              data: entities[keyPair[0]]
            };
          });
          transaction.save(updateArray);

          // Check for datastore errors::
          return transaction.commit()
            .catch((error) => {
              log('DS2 :: error, datastore commit failed, rolling back.');

              // Rollback the transaction, pass error to our final error handler:
              return transaction.rollback().then(() => Promise.reject(error));
            });
        })
        
        // Release locks if transaction is successful:
        .then(() => Dread.release(keySet))

        /**
         * Final error handler:
         * - If rejected by developer
         * - If exception was found
         * - If datastore error was found
         * 
         * We release the locks.
         */
        .catch((error) => Dread.release(keySet).then(() => Promise.reject(error)));

      return promise;

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
  }

  class Entity {
    setValidator (validatorFn) {
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
    upsert (upsertData) {
      let key = this.key;
      let validatorFn = this.validatorFn;
      if (Boolean(key) === false) {
        return Promise.reject("Missing entity KEY, UPSERT can't proceed.");
      }
      return Promise.resolve()
        .then(() => {
          if (Boolean(validatorFn) === true) {
            return validatorFn(upsertData);
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
              entities.temp = upsertData;
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
module.exports = DS2;
