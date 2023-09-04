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

const ITERATE_KEY = Symbol();
const TriggerType = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE'
}
const RAW_KEY = Symbol()

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
  activeEffectFn.deps.add(keySet);
}

function trigger(target, key, type) {
  const targetMap = bucket.get(target);
  if (!targetMap) return;
  const keySet = targetMap.get(key);
  
  const keySetToRun = new Set();
  keySet && keySet.forEach(fn => {
    if (fn !== activeEffectFn) {
      keySetToRun.add(fn)
    }
  });
  if(type === TriggerType.ADD || type === TriggerType.DELETE) {
    const iterateEffects = targetMap.get(ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(fn => {
      if (fn !== activeEffectFn) {
        keySetToRun.add(fn)
      }
    });
  }
  keySetToRun.forEach(fn => {
    if (fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

// 将 obj 设置为响应式对象
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      if(key === RAW_KEY) {
        return target;
      };
      if(!isReadonly) {
        track(target, key);
      }
      const res = Reflect.get(target, key, receiver);
      // 浅响应
      if(isShallow) return res
      if (typeof res === 'object' && res !== null) {
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
        Object.prototype.hasOwnProperty.call(target, key)
          ? TriggerType.SET 
          : TriggerType.ADD;
      const res = Reflect.set(target, key, newVal, receiver);
      // target === receiver[RAW_KEY] 说明 receiver 就是 target 的代理对象
      if(target === receiver[RAW_KEY]) {
         // 当值真正发生变化并且都不是 NaN 的时候；NaN === NaN false
        if(oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type);
        }
      }
      return res;
    },
    has(target, key,) {
      track(target, key)
      return Reflect.has(target, key)
    },
    ownKeys(target) {
      track(target, ITERATE_KEY)
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

function reactive(obj) {
  return createReactive(obj, false)
}

function shallowReactive(obj) {
  return createReactive(obj, true)
}

function readonly(obj) {
  return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
  return createReactive(obj, true, true)
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

const obj = {
  a: 1,
}

const p = reactive(obj)

