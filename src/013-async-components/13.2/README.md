# 13 异步组件和函数式组件

## 13.1 异步组件要解决的问题

从根本上讲，异步组件的实现完全不需要任何框架层面的支持，用户可以完全自己实现：

```js
// utils
const add = (a, b)  => {
  return a + b;
}

export {
  add
}
```

直接使用 ES 提供的动态 import 方法就可以实现一个异步组件

```js
// index.js
const loader = () => import('./utils.js');

loader()
  .then((utils) => {
    const { add } = utils;
    const res = add(1, 2);
    console.log(res);
  })
```

如果我们用 import 来动态加载一个组件，上面的方式基本可以了，只是说，这样实现还存在一些缺陷：
- 如果加载失败或者加载超时，是否要渲染 Error 组件
- 组件在加载时，是否要展示占位的内容？例如渲染一个 Loading 组件。
- 组件加载的速度可能很快，也可能很慢，是否要设置一个延迟展示 Loading 组件的事件？比如，如果组件在 200ms 内没有加载成功才展示 Loading 组件，这样可以避免由组件加载过快所导致的闪烁。
- 组件加载失败后，是否需要重试

这些问题都是实际开发中需要用到的，所以为了更好地解决这些问题，就需要在框架层面为异步组件提供更好的封装，所要提供的能力与上对应：
- 允许用户指定加载出错时要渲染的组件
- 允许用户指定 Loading 组件，以及延迟展示的时间
- 允许用户设置加载组件的超时事件
- 组件加载失败时，为用户提供重试的机制。

## 13.2 异步组件的实现原理

### 13.2.1 封装 defineAsyncComponent 函数

所谓的异步组件，其实就是通过封装的手段来实现友好的用户接口，从而降低用户层面的使用复杂度。

```vue
<template>
  <AsyncComp />
</template>

<script>
  export default {
    components: {
      // 使用 defineAsyncComponent 定义一个异步组件，它接收一个加载器作为参数
      AsyncComp: defineAsyncComponent(()) => import('CompA')
    }
  }
</script>
```

```js
/**
 * 高阶组件，定义异步组件，接收一个异步组件作为参数
 * @param {*} loader 
 * @returns 返回一个组件
 */
function defineAsyncComponent(loader) {
  // 一个变量，用于存储异步加载的组件
  let InnerComp = null;
  return {
    name: 'AsyncComponentWrapper',
    setup() {
      // 是否已经加载完成
      const loaded = ref(false);
      // 执行加载器函数，返回一个 Promise 实例
      // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true
      loader().then((comp) => {
        InnerComp = comp;
        loaded.value = true;
      }).catch((err) => {

      }).finally(() => {

      });

      return () => {
        if(loaded.value) {
          // 如果异步组件加载成功，则渲染该组件
          return { type: InnerComp };
        } else {
          // 否者渲染一个占位符
          return { type: Text, children: '' }
        }
      }
    }
  }
}
```

可以看到：
- defineAsyncComponent 函数本质上是一个高阶组件，它的返回值是一个包装组件
- 包装组件会根据加载的状态来渲染内容，如果加载成功了，那么渲染组件，否者渲染一个占位符
- 通常占位内容是一个注释节点。组件没有别加载成功时，页面会渲染一个注释节点来占位。但这里我们使用了一个空文本节点来占位。

### 13.2.2 超时与 Error 组件
异步组件通常以网络请求的形式进行加载。前端发起一个 HTTP 请求，获取 js 资源。既然存在网络请求，那么必然考虑网络情况，尤其在弱网环境下，加载一个组件可能需要很长时间，因为，需要为用户提供指定超时的能力，当加载组件的事件超过了指定时长后，会触发超时错误，同时，如果用户还配置了 Error 组件，那么便会渲染该 Error 组件。

```js
/**
 * 高阶组件，定义异步组件，接收一个异步组件作为参数
 * @param {*} options 
 * @returns 返回一个组件
 */
function defineAsyncComponent(options) {
  // 一个变量，用于存储异步加载的组件
  let InnerComp = null;
  return {
    name: 'AsyncComponentWrapper',
    setup() {
      if(typeof options === 'function') {
        options = { loader: options }
      }
      const { loader, timeout, errorComponent } = options;
      // 是否已经加载完成
      const loaded = ref(false);
      // 是否发生了错误，并且记录错误对象
      const error = ref(null);
      let timeoutTimer = null;

      // 执行加载器函数，返回一个 Promise 实例
      // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true
      loader().then((comp) => {
        InnerComp = comp;
        loaded.value = true;
        clearTimeout(timeoutTimer);
      }).catch((err) => {
        error.value = err;
      }).finally(() => {

      });

      if (timeout) {
        timeoutTimer = setTimeout(() => {
          const e = new Error(`Async component timed out after ${timeout}ms`)
          error.value = e;
        }, timeout);
      }

      return () => {
        if(loaded.value) {
          // 如果异步组件加载成功，则渲染该组件
          return { type: InnerComp };
        } else if (error.value && errorComponent) {
          // 当错误存在并且用户配置了 errorComponent 时才展示 Error 组件，同时将 error 作为 props 传递
          // 渲染错误组件 并且把错误信息通过 props 传递给错误组件
          return { type: errorComponent, props: { error: error.value } }
        } else {
          // 否者渲染一个占位符
          return { type: Text, children: '' }
        }
      }
    }
  }
}
```

### 13.2.3 延时与 Loading 组件
加载中展示 Loading 组件，但如果网络请求过快，Loading 组件刚刚渲染完成就要卸载去渲染加载的组件，会出现闪烁，所以，可以提供一个延时展示 Loading 组件的机制

异步组件加载受到网络影响较大，加载过程可能很快，也可能很慢。
- 对于慢，可以通过加载 Loading 组件来提供更好的用户体验
- 对于快，如果还是从加载开始的那一刻就展示 Loading 组件的话，会导致 Loading 组件刚完成渲染就立即进入卸载阶段，于是出现闪烁的情况。

因此，可以为 Loading 组件设置一个延迟展示的时间。例如，当超过 200ms 没有完成加载，才展示 Loading 组件，否者就不展示了。这样，对于在 200ms 内能够完成加载的情况来说，就避免了闪烁问题。
> 但是，这并非银弹，是有缺陷的。
> 
> 比如，设定 200ms 的延时展示时间，如果请求在 200 ms 以内返回挺好的，但如果是 201 或者 300ms 返回呢？是不是还是存在闪烁呢？所以这并不能完全解决问题，但因为延时展示时间可以由开发者根据自己的请求大致清理来自己设定，所以大部分情况还是可以 cover 掉的。

```js
/**
 * 高阶组件，定义异步组件，接收一个异步组件作为参数
 * @param {*} options 
 * @returns 返回一个组件
 */
function defineAsyncComponent(options) {
  // 一个变量，用于存储异步加载的组件
  let InnerComp = null;
  return {
    name: 'AsyncComponentWrapper',
    setup() {
      if(typeof options === 'function') {
        options = { loader: options }
      }
      const { loader, delay, loadingComponent, timeout, errorComponent } = options;
      // 是否已经加载完成
      const loaded = ref(false);
      // 加载中
      const loading = ref(false);
      let delayTimer = null;
      // 是否发生了错误，并且记录错误对象
      const error = ref(null);
      let timeoutTimer = null;

      if (delay) {
        // 如果存在 delay，则开启一个定时器，当延迟到时候将 loading 设置为 true
        delayTimer = setTimeout(() => {
          loading.value = true;
        }, delay);
      } else {
        loading.value = true;
      }

      // 执行加载器函数，返回一个 Promise 实例
      // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true
      loader().then((comp) => {
        InnerComp = comp;
        loaded.value = true;
      }).catch((err) => {
        error.value = err;
      }).finally(() => {
        // 无论加载是否成功，只要完成，就清除超时定时器
        clearTimeout(timeoutTimer);
        // 无论加载是否成功，只要完成，就将 loading 设置为 false，并且清除延迟展示 Loding 定时器
        loading.value = false;
        clearTimeout(delayTimer);
      });

      if (timeout) {
        timeoutTimer = setTimeout(() => {
          const e = new Error(`Async component timed out after ${timeout}ms`)
          error.value = e;
        }, timeout);
      }

      return () => {
        if(loaded.value) {
          // 如果异步组件加载成功，则渲染该组件
          return { type: InnerComp };
        } else if (error.value && errorComponent) {
          // 当错误存在并且用户配置了 errorComponent 时才展示 Error 组件，同时将 error 作为 props 传递
          // 渲染错误组件 并且把错误信息通过 props 传递给错误组件
          return { type: errorComponent, props: { error: error.value } }
        } else if(loading.value && loadingComponent) {
          // 如果异步组件正在加载并且配置了 loadingComponent，渲染 loadingComponent
          return { type: loadingComponent }
        } else {
          // 否者渲染一个占位符
          return { type: Text, children: '' }
        }
      }
    }
  }
}
```

这里有一点需要注意的是，当异步组件加载成功后，会卸载 Loading 组件并渲染异步加载的组件，为了支持 Loading 组件的卸载，需要修改 unmount 函数

```js
/**
 * 卸载操作
 * @param {*} vnode 
 */
function unmountElement(vnode) {
  // 卸载时，如果卸载的 vnode 类型是 Fragment，那么需要卸载的是它的所有子节点
  if (vnode.type === Fragment) {
    vnode.children.forEach(child => unmountElement(child))
    return
  } else if(isObject(vnode.type)) {
    // 对于组件的卸载，本质上是要卸载组件所渲染的内容，即 subTree
    unmountElement(vnode.component.subTree)
  }
  // 根据 vnode 获取要卸载的真实 DOM 元素
  const el = vnode.el;
  // 获取真实 DOM 的父元素
  const parent = el.parentNode;
  if(parent) unmount(el, parent)
}
```