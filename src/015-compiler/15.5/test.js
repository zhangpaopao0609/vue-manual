/**
 * 第一种
 */

// const context = {
//   a: 1
// }

// function t(context) {
//   return () => {
//     console.log(context.a);
//   }
// }

// const tt = t(context);

// context.a = 2;

// tt()


/**
 * 第二种
 */

// const context = {
//   a: 1,
//   b: {
//     c: 2
//   }
// }

// function t(obj, context) {
//   obj = b
//   return () => {
//     console.log(obj.c, context);
//   }
// }

// const tt = t(context.b, context);

// context.b.c = 6

// tt()


/**
 * 第三种
 */

const b = {
  c: 2
}

const context = {
  a: 1,
  b
}

function t(obj, context) {
  obj = b
  return () => {
    console.log(obj.c, context);
  }
}

const tt = t(context.b, context);

context.b.c = 6

tt()