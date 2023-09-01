// 用户收集副作用函数的桶
const bucket = new Map();
// 记录当前的副作用函数
let activeEffectFn = null;
const effectFnStack = [];
// 收集副作用函数的函数
function effect(fn, options = {}) {
  const effectFn = function () {
    // 执行副作用函数之前，在收集过它的依赖集合中删除它
    effectFn.deps.forEach(dep => dep.delete(effectFn));
    activeEffectFn = effectFn;
    effectFnStack.push(effectFn);
    const res = fn();
    effectFnStack.pop();
    activeEffectFn = effectFnStack[effectFnStack.length - 1];
    return res;
  }

  effectFn.deps = new Set();
  effectFn.options = options;
  if(!options.lazy) {
    effectFn();
  }
  return effectFn;
}

function track(target, key) {
  if (!activeEffectFn) return;
  // target 对应的 map，这个 map 是用于收集所有属性的
  if (!bucket.has(target)) {
    bucket.set(target, new Map());
  };
  const targetMap = bucket.get(target);
  // key 对应的 set，这个 set 是用于收集这个属性对应的所有副作用函数
  if (!targetMap.has(key)) {
    targetMap.set(key, new Set())
  }
  const keySet = targetMap.get(key);
  // 把副作用函数放进 keySet
  keySet.add(activeEffectFn);
  activeEffectFn.deps.add(keySet)
}

function trigger(target, key, val) {
  const targetMap = bucket.get(target);
  if (!targetMap) return;
  const keySet = targetMap.get(key);
  if (!keySet) return;
  const keySetToRun = new Set();
  keySet.forEach(fn => {
    if (fn !== activeEffectFn) {
      keySetToRun.add(fn)
    }
  })
  keySetToRun.forEach(fn => {
    if (fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

// 将 obj 设置为响应式对象
function reactive(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      track(target, key)
      return Reflect.get(target, key, receiver)
    },
    set(target, key, val) {
      target[key] = val;
      trigger(target, key)
    },
  });
}

function computed(getter) {
  let dirty = true;
  let value = null;
  
  const effectFn = effect(getter, 
    { 
      lazy: true, 
      scheduler() {
        dirty = true;
        trigger(obj, 'value')
      } 
    }
  );

  const obj = {
    get value() {
      if(!dirty) return value;
      value = effectFn();
      dirty = true;
      track(obj, 'value')
      return value;
    }
  }

  return obj;
}

function watch(source, cb, options = {}) {
  let getter;
  function traverse(value, seen=new Set()) {
    if(typeof value !== 'object' || value === null || seen.has(value)) return
    seen.add(value)
    for(const k in value) {
      traverse(value[k], seen)
    }

    return value
  }

  if(typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  let cleanup;
  let oldValue;
  let newValue;

  const onInvalidate = (cb) => {
    cleanup = cb;
  }

  const job = () => {
    if(cleanup) cleanup();
    newValue = effectFn();
    cb(newValue, oldValue, onInvalidate);
    oldValue = newValue
  }

  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if(options.post === 'flush') {
        Pormise.resolve().then(job)
      } else {
        job()
      }
    }
  });

  if (options.immediate) {
    job()
  } else {
    oldValue = effectFn()
  }
}

const obj = {
  foo: 1,
  get bar() {
    return this.foo
  }
}

const p = reactive(obj);

effect(() => {
  console.log(p.bar);
});

setTimeout(() => {
  p.foo = 2
}, 1000);