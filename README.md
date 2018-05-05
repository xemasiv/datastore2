# Datastore2

* Atomic transactions
  * Either all entities get commits, or none at all.
* Requires use of pure functions to modify entities
  * Take in fetched entities, return modified entities
  * Return `Promise.resolve(entities)` to proceed transaction.
  * Return `Promise.reject(...whatever)` to cancel transaction, and pass whatever to your `catch`.
* Entity locking with `dreadlocks`
  * Transaction will be delayed if one of its entities are involved in other transactions
  * Ensures isolation and consistency of involved entities in transactions.
* Simplified entity search from supplied filters.
  * Saves you the hassle of manually crafting queries.
* Simplified entity creation from UUIDv4 key name.
  * Also uses transactions, so users don't unknowingly write on the same key name.
* Simplified queries with endCursor and query hash provided for caching.
  * Easier search, and unique hash for each query instance for easier caching.

---

### Changelog

* 2.x
  * Added `Entity.delete()`
  * Added `Query.offset(x)`
  * Use of `dreadlocks` and use of pure function as executor function in Transactions..
    * Fixes data integrity & consistency problems on same-entity transactions that commit at the same time.
  * Added Query result hashing for caching purposes.
    ```
    new Query('Persons')
      .runQuery(({ entities, keys, endCursor, hash }) => {
        console.log(hash);
      });
    ```
  * Added AVA tests
    ```
    npm test
    ```
  * Added `Entity.useValidator` support. This allows you to validate your data before Entity `update` and `merge` calls. Just return `Promise.resolve()` to proceed, or `Promise.reject(whatever)` to cancel.
    ```
    const Joi = require('joi');
    entity3.useValidator((data) => {
      const schema = {
        first_name: Joi.string().alphanum(),
        last_name: Joi.string().alphanum(),
        email: Joi.string().email()
      };
      const result = Joi.validate(data, schema);
      if (result.error !== null) {
        return Promise.reject(result.error.details);
      } else {
        return Promise.resolve();
      }
    });
    ```
    * Use `joi` or `ajv` as you wish:
      * https://www.npmjs.com/package/joi
      * https://www.npmjs.com/package/ajv
      * Note: Please be mindful about using `required` fields on your schema. The Entity `merge` method could fail when a required field is missing (that's the point of merge, right?)
* 1.x
  * Transaction class
  * Queue class
  * Entity class
  * Key class

---

### Examples:

##### Setup:

* With NPM:
```
npm install datastore2 --save
```
* With YARN:
```
yarn add datastore2
```
* Script:
```
// Set datastore constructor opts
const opts = {
  projectId: 'projectNameGoesHere'
};
// Destructure
const Datastore2 = require('datastore2');
const { Key, Transaction, Entity, Query } = Datastore2(opts);
```

##### Entity from UUIDv4 key name:

* Notes:
  * `setKind()` must be called first.

```
let Alice = new Entity();
Alice.setKind('Persons').fromUUID()
  .then(() => {
    console.log(Alice);
    console.log(Alice.key);
  });
```

```
// console.log(Alice);
Entity {
  kind: 'Persons',
  key:
   Key {
     namespace: undefined,
     name: 'a71757ec-2565-4c0e-ab2f-0df909eba87b',
     kind: 'Persons',
     path: [Getter] } }

// console.log(Alice.key);
Key {
  namespace: undefined,
  name: 'a71757ec-2565-4c0e-ab2f-0df909eba87b',
  kind: 'Persons',
  path: [Getter] }
```

##### Entity data update:

* Notes:
  * Overwrites existing entity data.

```
let Alice = new Entity();
Alice.setKind('Persons').fromUUID()
  .then(() => {
    return Alice.update({
      first_name: 'Alice'
    });
  });
```

##### Entity data merge:

* Notes:
  * Merges new data with existing entity data
  * Uses `Object.assign`

```
let Alice = new Entity();
Alice.setKind('Persons').fromUUID()
  .then(() => {
    return Alice.merge({
      last_name: 'Alice'
    });
  });
```

##### Creating a key:

* Arguments:
  * `kind`
  * `keyName`
* Notes:
  * Strictly applies `String()` to keyName.
  * This is because entities with `Numerical ID's` as keyName eventually creates unpredictability once their keyName is passed between servers and browsers.
  * There are times these `Numerical ID's` are received by browsers as `Integer` but then sent back as `String`.
  * Entities get `Numerical ID's` when they are created using the Google Cloud Datastore Console and you skip assigning a `Custom Name` as the Entity's `Key Identifier`.

```
let aliceKey = Key('Persons', 'alice-key-name');
```

##### Entity from key:

* Notes:
  * No need to call `setKind()` first since entity kind is already supplied in your Key.
  * This flow is ideal for direct updates and merges.
  * If you intend to read the data first before performing mutations, using the `Transaction` class is highly recommended.

```
let aliceKey = Key('Persons', 'alice-key-name');
let Alice = new Entity();
Alice.setKey(aliceKey)
  // .update() or .merge() goes here
```

##### Entity from filters:

* Notes:
  * `setKind()` must be called first.

```
let Alice = new Entity();
Alice
  .setKind('Persons')
  .fromFilters(
    ['first_name', '=', 'Alice'],
    ['last_name', '=', 'Park']
  )
  .then(() => {
    console.log(Alice.key);
  })
  .catch((e) => console.log('error:', e));
```

```
Key {
  namespace: undefined,
  name: '41719603-268f-439b-a6a8-fcc15e34b380',
  kind: 'Persons',
  path: [Getter] }
```

##### Basic transaction:

* Flow Notes:
  * `new Transaction()` creates a Transaction.
  * Then you supply your mapped keys to `.keys()`
  * You call `.exec()` to supply your executor function.
  * Executor function accept one argument:
    * `entities` - the entities involved in transaction, modify them DIRECTLY as you wish.
  * Executor function must return Promise
    * `Promise.resolve()` allows transaction to proceed.
    * `Promise.reject() `discontinues transaction, rollback.
* Example Notes:
  * `Alice.balance` is 50
  * `Bob.balance` is 0
  * Alice sends `transactionAmount` (50) to Bob.

```
const aliceKey = Key('Persons', 'alice-key-name')
const bobKey = Key('Persons', 'bob-key-name')

const transactionAmount = 50;

new Transaction()
  .keys({ alice: aliceKey, bob: bobKey })
  .exec((entities) => {
    entities.alice.balance -= transactionAmount;
    entities.bob.balance += transactionAmount;
    if (entities.alice.balance < 0) {
      return Promise.reject("Alice can't send that much.");
    } else {
      return Promise.resolve(entities);
    }
  });
```

##### Entity delete:
```
const aliceKey = Key('Persons', 'alice-key-name')

let Alice = new Entity().setKey(aliceKey);
Alice.delete()
  .then(() => console.log('Alice deleted!'));
```

##### Entity queries:

* Notes:
  * Required `kind` must be supplied to constructor, while `endCursor` is optional.
    * `new Query()` is invalid
    * `new Query('Persons')` is valid
    * `new Query('Persons', 'endcursorxyz')` is valid.
  * `.order()` method is replaced with `.ascend()` and `.descend()` for readability.
  * As per Google Datastore docs on Queries, when you use an inequality filter to a column, you must sort that same column BEFORE you sort other columns.
    * In which case calling `.ascend('age')` or `.descend('age')` after calling `.filter('age', '>', 20)` is the right thing to do.
* Supported methods:
  * `.ascend(col)`
    * `col` is the column you want to ascend.
  * `.descend(col)`
  * `col` is the column you want to descend.
  * `.select(fields)`
    * `fields` - array of strings
  * `.filter(col, operator, val)`
    * `col` is column, for example: 'first_name'
    * `operator`, for example: '='
    * `val` is value, for example: 'Alice'
  * `.offset(val)`
    * `val` is value, for example: 5
  * `.limit(limit)`
    * `limit` is integer, for example: 1
  * `.runQuery()`
    * Runs the query.
    * Returns object
      * Has `entities`, `keys`, `endCursor` and `hash`.

```
  new Query('Persons')
    .filter('first_name', '=', 'Alice')
    .limit(1)
    .runQuery()
    .then(({ entities, keys, endCursor, hash }) => {

      });
```

---

## License

Attribution 4.0 International (CC BY 4.0)

* https://creativecommons.org/licenses/by/4.0/
* https://creativecommons.org/licenses/by/4.0/legalcode.txt

![cc](https://creativecommons.org/images/deed/cc_blue_x2.png) ![by](https://creativecommons.org/images/deed/attribution_icon_blue_x2.png)
