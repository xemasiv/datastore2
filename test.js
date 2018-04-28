// test.json and constructor opts
process.env["GOOGLE_APPLICATION_CREDENTIALS"] = __dirname.concat("/test.json");
const opts = {
  projectId: 'pac-1234'
};

import test from 'ava';

const { Key, Entity, Query, Transaction } = require('./index')(opts);

const RegExUUIDv4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let entity1 = new Entity();
let entity2 = new Entity();

test('1', t => {
  console.log('#1: Entity1 fromUUID, RegEx test');
  return entity1.setKind('Persons').fromUUID()
    .then(() => {
      console.log('key kind:', entity1.key.kind);
      console.log('key name:', entity1.key.name);
      return RegExUUIDv4.test(entity1.key.name) ? t.pass() : t.fail();
    })
    .catch(t.fail);
});
test('2', t => {
  console.log(' ');
  console.log('#2: Entity1 UPDATE first_name = Ana');
  return entity1.update({
      first_name: 'Ana'
    })
    .then(() => {
      return new Query('Persons')
        .filter('__key__', '=', entity1.key)
        .runQuery();
    })
    .then(({entities}) => {
      return entities[0].first_name === 'Ana' ? t.pass() : t.fail();
    })
    .catch(t.fail);
});
test('3', t => {
  console.log(' ');
  console.log('#3: Entity1 UPDATE first_name = Alice');
  return entity1.update({
      first_name: 'Alice'
    })
    .then(() => {
      return new Query('Persons')
        .filter('__key__', '=', entity1.key)
        .runQuery();
    })
    .then(({entities}) => {
      return entities[0].first_name === 'Alice' ? t.pass() : t.fail();
    })
    .catch(t.fail);
});
test('4', t => {
  console.log(' ');
  console.log('#4: Entity1 MERGE last_name = Parks, balance = 100');
  return entity1.merge({
      last_name: 'Parks',
      balance: 100
    })
    .then(() => {
      return new Query('Persons')
        .filter('__key__', '=', entity1.key)
        .runQuery();
    })
    .then(({entities}) => {
      return (
        entities[0].first_name === 'Alice' &&
        entities[0].last_name === 'Parks' &&
        entities[0].balance === 100
      ) ? t.pass() : t.fail();
    })
    .catch(t.fail);
});
test('5', t => {
  console.log('#5: Entity2 fromUUID, RegEx test');
  return entity2.setKind('Persons').fromUUID()
    .then(() => {
      console.log('key kind:', entity2.key.kind);
      console.log('key name:', entity2.key.name);
      return RegExUUIDv4.test(entity2.key.name) ? t.pass() : t.fail();
    })
    .catch(t.fail);
});
test('6', t => {
  console.log(' ');
  console.log('#6: Entity2 UPDATE first_name = Bob, balance = 0');
  return entity2.update({
      first_name: 'Bob',
      balance: 0
    })
    .then(() => {
      return new Query('Persons')
        .filter('__key__', '=', entity2.key)
        .runQuery();
    })
    .then(({entities}) => {
      return (
        entities[0].first_name === 'Bob' &&
        entities[0].balance === 0
      ) ? t.pass() : t.fail();
    })
    .catch(t.fail);
});

let simpleTransaction = (senderKey, receiverKey, amount) => {
  console.log('sender key name:', senderKey.name);
  console.log('receiver key name:', receiverKey.name);
  console.log('transaction amount:', amount);
  return new Transaction()
    .keys({
      sender: senderKey,
      receiver: receiverKey
    })
    .init(({entities, commit, rollback}) => {
      if (amount > entities.sender.balance) {
        return rollback();
      } else {
        entities.sender.balance -= amount;
        entities.receiver.balance += amount;
        return commit(entities);
      }
    });
}

test('7', t => {
  console.log(' ');
  console.log('#7: Transaction should fulfill.');
  const amount = 55;
  return simpleTransaction(entity1.key, entity2.key, amount)
    .then((result) => {
      console.log('Transaction fulfilled.');
      t.pass();
    })
    .catch((e) => {
      console.log('Transaction rejected.');
      t.fail(e);
    });
});
test('8', t => {
  console.log(' ');
  console.log('#8: Transaction should reject.');
  const amount = 55;
  return simpleTransaction(entity1.key, entity2.key, amount)
    .then((result) => {
      console.log('Transaction fulfilled.');
      t.fail();
    })
    .catch((e) => {
      console.log('Transaction rejected.');
      t.pass(e);
    });
});
