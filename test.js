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
let entity3 = new Entity();

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

let selfTransaction = (selfKey, amount) => {
  return new Transaction()
    .keys({
      self: selfKey
    })
    .exec((entities) => {
      // console.log('amount:', amount);
      // console.log('before:', entities.self.balance);
      entities.self.balance += amount;
      // console.log('now:', entities.self.balance);
      return Promise.resolve(entities);
    });
}
let simpleTransaction = (senderKey, receiverKey, amount) => {
  return new Transaction()
    .keys({
      sender: senderKey,
      receiver: receiverKey
    })
    .exec((entities) => {
      if (amount > entities.sender.balance) {
        return Promise.reject('amount greater than sender balance, cant proceed');
      } else {
        // console.log('amount:', amount);
        // console.log('before:', entities.sender.balance, entities.receiver.balance);
        entities.sender.balance -= amount;
        entities.receiver.balance += amount;
        // console.log('now:', entities.sender.balance, entities.receiver.balance);
        return Promise.resolve(entities);
      }
    });
}
test('7', t => {
  console.log(' ');
  console.log('#7: Transaction should fulfill.');
  const amount = 40;
  return simpleTransaction(entity1.key, entity2.key, amount)
    .then((result) => {
      console.log('Transaction fulfilled.');
      t.pass();
    })
    .catch(() => {
      console.log('Transaction rejected.');
      t.fail();
    });
});
test('8', t => {
  console.log(' ');
  console.log('#8: Transaction should reject.');
  const amount = 100;
  return simpleTransaction(entity1.key, entity2.key, amount)
    .then((result) => {
      console.log('Transaction fulfilled.');
      t.fail();
    })
    .catch(() => {
      console.log('Transaction rejected.');
      t.pass();
    });
});
test('9', t => {
  console.log(' ');
  console.log('#9: Testing multi-key multiple transactions.');
  let p = [];
  let timeStart = Date.now();
  for (var i=1; i <= 10; i++){
    p.push(simpleTransaction(entity1.key, entity2.key, 5));
  }
  return Promise.all(p)
    .then((result) => {
      let ms = Date.now() - timeStart;
      console.log('Took', ms, 'ms');
      console.log((ms / 1000) / p.length, 'transactions / second');
      console.log('Transaction fulfilled.');
      t.pass();
    })
    .catch((...e) => {
      console.log('Transaction rejected.');
      console.log.apply(console, e);
      t.fail();
    });
});

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
test('10', t => {
  console.log(' ');
  console.log('#10: Entity3 fromUUID, UPDATE w/ schema');
  return entity3.setKind('Persons').fromUUID()
    .then(() => {
      return entity3.update({
        first_name: 'Charles',
        last_name: 'Babbage',
        email: 'charles@babbage.com'
      });
    })
    .then((e) => {
      console.log('Expected success OK.');
      t.pass();
    })
    .catch((e) => {
      console.log('Unexpected reject </3.');
      console.log(e);
      t.fail();
    });
});
test('11', t => {
  console.log(' ');
  console.log('#11: Entity3 w/ schema UPDATE, should reject');
  return Promise.resolve()
    .then(() => {
      return entity3.update({
        first_name: 'Charles',
        last_name: 'Babbage',
        email: 123
      });
    })
    .then((e) => {
      console.log('Unexpected success </3.');
      t.fail();
    })
    .catch((e) => {
      console.log('Expected reject OK.');
      console.log(e);
      t.pass();
    });
});
test('12', t => {
  console.log(' ');
  console.log('#12: Entity3, MERGE w/ schema');
  return Promise.resolve()
    .then(() => {
      return entity3.merge({
        email: 'charles_new_email@babbage.com'
      });
    })
    .then((e) => {
      console.log('Expected success OK.');
      t.pass();
    })
    .catch((e) => {
      console.log('Unexpected reject </3.');
      console.log(e);
      t.fail();
    });
});
test('13', t => {
  console.log(' ');
  console.log('#13: Entity3 w/ schema MERGE, should reject');
  return Promise.resolve()
    .then(() => {
      return entity3.merge({
        email: 123
      });
    })
    .then((e) => {
      console.log('Unexpected success </3.');
      t.fail();
    })
    .catch((e) => {
      console.log('Expected reject OK.');
      console.log(e);
      t.pass();
    });
});
