## Datastore2

### Backstory

* Google Cloud's Datastore library is cool.
* Yet some parts were repetitive.
* Wrote this, life has never been the same.

---

### Features

* Creation of keys
* Entity creation with UUIDv4 as keyname
* Atomic entity updates & merges
* Atomic transactions, for multiple entities
* Entity fetching from filters
* Entity queries with endCursor support

### Missing Features

* Namespace support
* Ancestors support

It's because I don't use them for now, will definitely add them soon. Open to PR's!

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
  * You call `.init()` to supply your executor function.
  * Your executor function must accept two arguments:
    * entities - the entities involved in transaction, modify them DIRECTLY as you wish.
    * commit - a callback function to save the changes and commit the transaction. Returns a promise so it can be chained.
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
  .init((entities, commit) => {
    entities.alice.balance -= transactionAmount;
    entities.bob.balance += transactionAmount;
    return commit(entities);
  });
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
  * `.limit(limit)`
    * `limit` is integer, for example: 1
  * `.runQuery()`
    * Runs the query.
    * Returns object with `entities`, `keys`, `endCursor`.

```
  new Query('Persons')
    .filter('first_name', '=', 'Alice')
    .limit(1)
    .runQuery()
    .then(({ entities, keys, endCursor }) => {

      });
```

---

### LICENSE

![C](https://upload.wikimedia.org/wikipedia/commons/8/84/Public_Domain_Mark_button.svg) ![0](https://upload.wikimedia.org/wikipedia/commons/6/69/CC0_button.svg)
