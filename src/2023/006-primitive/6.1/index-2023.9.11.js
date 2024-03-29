// 用户收集副作用函数的桶
const bucket = new Map();
// 记录当前的副作用函数
let activeEffectFn = null;
const effectFnStack = [];
// 一个标记变量，代表是否进行追踪。
let shouldTrack = true;

const ITERATE_KEY = Symbol();
const MAP_KEY_ITERATE_KEY = Symbol();
const TriggerType = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE'
}
const RAW_KEY = Symbol();
const LENGTH_KEY = 'length';
const SYMBOL_TYPE = 'symbol';
const SIZE_KEY = 'size';

// ref
const REF_INNER_KEY = '__v_isRef'

function isObjectNotNull(obj) {
  return obj !== null && typeof obj === 'object';
}

function isNotEqual(oldVal, newVal) {
  return oldVal !== newVal && (oldVal === oldVal || newVal === newVal)
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isSet(obj) {
  return Object.prototype.toString.call(obj) === '[object Set]'
}

function isMap(obj) {
  return Object.prototype.toString.call(obj) === '[object Map]'
}

function getRawVal(value) {
  return value[RAW_KEY] || value
}

function wrapReactive(v) {
  return isObjectNotNull(v) ? reactive(v) : v;
}

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
  if (!activeEffectFn || !shouldTrack) return;
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
  activeEffectFn.deps.add(keySet);
}

function trigger(target, key, type, newVal) {
  const targetMap = bucket.get(target);
  if (!targetMap) return;
  const keySet = targetMap.get(key);
  
  const keySetToRun = new Set();
  keySet && keySet.forEach(fn => {
    if (fn !== activeEffectFn) {
      keySetToRun.add(fn)
    }
  });
  if(
    type === TriggerType.ADD 
    || type === TriggerType.DELETE
    || (type === TriggerType.SET && isMap(target))
  ) {
    const iterateEffects = targetMap.get(ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(fn => {
      if (fn !== activeEffectFn) {
        keySetToRun.add(fn)
      }
    });
  }

  if(
   (type === TriggerType.ADD 
    || type === TriggerType.DELETE) && isMap(target)
  ) {
    const iterateEffects = targetMap.get(MAP_KEY_ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(fn => {
      if (fn !== activeEffectFn) {
        keySetToRun.add(fn)
      }
    });
  }

  // 当代理的对象为数组时，并且在增加元素时
  if(isArray(target) && type === TriggerType.ADD) {
    const lengthEffects = targetMap.get(LENGTH_KEY);
    lengthEffects && lengthEffects.forEach(fn => {
      if (fn !== activeEffectFn) {
        keySetToRun.add(fn)
      }
    });
  }

  // 当代理的对象为数组时，并且并且修改的键为 length 时
  if(isArray(target) && key === LENGTH_KEY) {
    targetMap.forEach((effects, key) => {
      if(key >= newVal) {
        effects.forEach(fn => {
          if (fn !== activeEffectFn) {
            keySetToRun.add(fn)
          }
        });
      }
    })
  }

  keySetToRun.forEach(fn => {
    if (fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

const arrayInstrumentations = {};

;['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
  // 数组的原始方法
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function(...args) {
    // this 指向的是 receiver，即代理对象
    let res = originMethod.apply(this, args);
    // 如果代理对象上没查找到
    if(res === false) {
      // 那么就在原始对象上查找一次
      res = originMethod.apply(this[RAW_KEY], args);
    }
    return res;
  }
})

;['push', 'pop', 'unshift', 'shift', 'splice'].forEach(method => {
  // 数组的原始方法
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function(...args) {
    shouldTrack = false;

    const res = originMethod.apply(this, args);

    shouldTrack = true;
    return res;
  }
})

function iterationMethod() {
  const target = this[RAW_KEY];
  // 获取原始迭代方法
  const itr = target[Symbol.iterator]();
  track(target, ITERATE_KEY)
  return {
    // 迭代器协议是指一个对象实现了 next 方法
    next() {
      const { value, done} = itr.next();
      return {
        value: value ? [wrapReactive(value[0]), wrapReactive(value[1])] : value,
        done
      }
    },
    // 可迭代协议是指一个对象实现了 Symbol.iterator
    [Symbol.iterator]() {
      return this
    }
  }
}

function kvIterationMethod(name, key) {
  const target = this[RAW_KEY];
  const itr = target[name]();
  track(target, key);
  return {
    next() {
      const {value, done} = itr.next();

      return {
        value: wrapReactive(value),
        done,
      }
    },
    [Symbol.iterator]() {
      return this;
    }
  };
}

const mutableInstrumentations = {
  // set
  add(val) {
    // 函数调用时，this 指向的是代理对象（因为 bind 了）
    const target = this[RAW_KEY];
    // 先判断是否有这个值
    const hasVal = target.has(val);
    // 原始数据对象上执行方法
    const res = target.add(val);
    // 如果没有这个值，才触发副作用函数
    if(!hasVal) {
      trigger(target, val, TriggerType.ADD)
    }
    return res;
  },
  delete(val) {
    const target = this[RAW_KEY];
    const hasVal = target.has(val);
    const res = target.delete(val);
    if(hasVal) {
      trigger(target, val, TriggerType.DELETE)
    }
    return res;
  },
  // map
  get(key) {
    const target = this[RAW_KEY];
    const res = target.get(key);
    return isObjectNotNull(res) ? reactive(res) : res;
  },
  // map 
  set(key, val) {
    const target = this[RAW_KEY];
    const hasKey = target.has(key);
    const oldVal = target.get(key);
    const res = target.set(key, getRawVal(val));
    if(!hasKey) {
      trigger(target, key, TriggerType.ADD);
    } else if(isNotEqual(oldVal, val)) {
      trigger(target, key, TriggerType.SET)
    }
    return res;
  },
  forEach(callback, thisArg) {
    const target = this[RAW_KEY];
    target.forEach((v, k) => {
      callback.call(thisArg, wrapReactive(v), wrapReactive(k), this);
    })
    track(target, ITERATE_KEY)
  },
  // 迭代器方法
  [Symbol.iterator]: iterationMethod,
  entries: iterationMethod,
  entries: iterationMethod,
  values() {
    // 这里为什么要 call 呢？
    // 1. 这里的 this 是谁？将会是代理对象，因为 Reflect(target, key, receiver)
    // 2. 这里 call 是因为如果不指向 this 的指向，那么 kvIterationMethod 函数在执行时，它的 this 指向的是 window
    return kvIterationMethod.call(this, 'values', ITERATE_KEY)
  },
  keys() {
    return kvIterationMethod.call(this, 'keys', MAP_KEY_ITERATE_KEY)
  }
}

// 将 obj 设置为响应式对象
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if(key === RAW_KEY) {
        return target;
      };
      if(isArray(target) && Object.prototype.hasOwnProperty.call(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      };
      if(isSet(target) || isMap(target)) {
        if(key === SIZE_KEY) {
          track(target, ITERATE_KEY);
          return Reflect.get(target, key, target);
        }
        return mutableInstrumentations[key];
      };
      if(!isReadonly && typeof key !== SYMBOL_TYPE) {
        track(target, key);
      };
      const res = Reflect.get(target, key, receiver);
      // 浅响应
      if(isShallow) return res
      if (isObjectNotNull(res)) {
        return isReadonly ? readonly(res) : reactive(res)
      }
      return res
    },
    set(target, key, newVal, receiver) {
      if(isReadonly) {
        console.warn(`property ${key} is readonly.`);
        return true;
      }
      const oldVal = target[key];
      // 如果属性不存在，则说明是添加新属性，否则是设置已有属性
      const type = 
        isArray(target)
          ? Number(key) < target.length
            ? TriggerType.SET
            : TriggerType.ADD
          : Object.prototype.hasOwnProperty.call(target, key)
            ? TriggerType.SET 
            : TriggerType.ADD;
      const res = Reflect.set(target, key, newVal, receiver);
      // target === receiver[RAW_KEY] 说明 receiver 就是 target 的代理对象
      if(target === receiver[RAW_KEY]) {
        // 当值真正发生变化并且都不是 NaN 的时候；NaN === NaN false
        if(isNotEqual(oldVal, newVal)) {
          trigger(target, key, type, newVal);
        }
      }
      return res;
    },
    has(target, key,) {
      track(target, key)
      return Reflect.has(target, key)
    },
    ownKeys(target) {
      track(target, isArray(target) ? LENGTH_KEY : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },
    deleteProperty(target, key) {
      if(isReadonly) {
        console.warn(`property ${key} is readonly.`);
        return true;
      }
      // 检查是否是自己的属性
      const hasKey = Object.prototype.hasOwnProperty.call(target, key);
      // 完成属性的删除
      const res = Reflect.deleteProperty(target, key);

      if(hasKey && res) {
      // 只有当被删除的属性是自己的属性并且成功删除时，才触发更新
        trigger(target, ITERATE_KEY, TriggerType.DELETE)
      }

      return res;
    }
  });
}

// 定义一个 map 实例，存储原始对象到代理对代理对应的映射
const reactiveMap = new Map();

function reactive(obj) {
  // 优先查找原始对象之前创建的代理对象
  const existionProxy = reactiveMap.get(obj);
  if(existionProxy) return existionProxy;
  // 否者正常创建
  const res = createReactive(obj, false);
  // 存储
  reactiveMap.set(obj, res);
  return res;
}

function shallowReactive(obj) {
  return createReactive(obj, true)
}

function ref(val) {
  const wrapper = {
    value: val,
  }

  // 属性默认不可写，不可枚举，用它来判读对象是否是 ref
  Object.defineProperty(wrapper, REF_INNER_KEY, {
    value: true,
  });

  return reactive(wrapper);
}

function readonly(obj) {
  return createReactive(obj, false, true);
}

function shallowReadonly(obj) {
  return createReactive(obj, true, true);
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
    },
    set value(newVal) {
      console.warn('cannot set it')
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

