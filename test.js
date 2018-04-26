process.env["GOOGLE_APPLICATION_CREDENTIALS"] = __dirname.concat("/test.json");
const { Key, Transaction, Entity } = require('./index')({
  projectId: 'pac-1234'
});
/*
const bobKey = Key('Persons', 'bob-key-name');
Entity
  .fetch({
    bob: bobKey
  })
  .then((entities, commit) => {
    console.log(entities);
  })
  .catch((e) => console.log('error:', e));

let aliceKey = Key(
  'Persons', '41719603-268f-439b-a6a8-fcc15e34b380'
);
let Alice = new Entity();
Alice.setKey(aliceKey);*/

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
/*
new Transaction()
  .keys({
    alice: Key('Persons', 'alice'),
    bob: Key('Persons', 'bob')
  })
  .init((entities, commit) => {
    console.log('entities:', entities);
    console.log('commit:', commit);
    entities.alice = {

    };
    entities.bob = {

    };
    commit(entities);
  });
*/
