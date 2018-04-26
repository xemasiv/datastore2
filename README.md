## Datastore2

---

### Simplified features

* Creation of keys
* Atomic transactions, for multiple entities
* Atomic entity upserts
* Atomic entity reads
* Entity fetching from filters
* Key-mapping of query results

---

### Examples:

##### Setup:

* NPM: `npm install datastore2 --save`
* YARN: `yarn add datastore2`

```
// Set datastore constructor opts
const opts = {
  projectId: 'projectNameGoesHere'
};

// Destructure
const Datastore2 = require('datastore2');
const { Key, Transaction, Entity } = Datastore2(opts);
```

##### Entity from UUIDv4 key name:

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

```
let aliceKey = Key('Persons', 'alice-key-name');
let Alice = new Entity();
Alice.setKey(aliceKey)
  // .update() or .merge() goes here
```

##### Entity from filters:

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

##### Basic Transaction:

```
// Scenario:
//   Alice sends 50 to bob.
// Where:
//   alice.balance = 50;
//   bob.balance = 0;

const aliceKey = Key('Persons', 'alice-key-name')
const bobKey = Key('Persons', 'bob-key-name')

const transactionAmount = 50;

new Transaction()
  .keys({ alice: aliceKey, bob: bobKey })
  .init((entities, commit) => {
    entities.alice.balance -= transactionAmount;
    entities.bob.balance += transactionAmount;
    commit(entities);
  });
```

Atomic entity read:

Entity queries:

Key-mapped entity queries:
