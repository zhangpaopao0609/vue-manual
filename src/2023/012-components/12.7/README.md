# 12 组件的实现原理

## 12.1 渲染组件

在 patch 函数中，我们处理了多种方式
- type 类型为 string，那么处理方式为普通元素节点
- type 为 Text，那么处理方式为文本
- type 为 Comment，那么处理方式为注释
- type 为 Fragment，那么处理方式为片段

同样的，当

- type 类型为 Object 时，那么处理方式为组件

首先，我们的 vnode 如下

```js
const MyComponent = {
  name: 'MyComponent',
  render() {
    return {
      type: 'div',
      children: '我是文本内容',
    }
  }
}

const vnode = {
  type: "div",
  children: [
    { type: 'p', children: '我是 p ', key: 1 },
    { type: MyComponent, key: 'MyComponent' }
  ]
}
```

在 patch 时进行不同的处理：

```js
} else if(isObject(type)) {
  // 如果 n2.type 的值的类型是对象，则描述的是组件
  if(!n1) {
    mountComponent(n2, container, anchor)
  } else {
    patchComponent(n1, n2, anchor)
  }
```

然后进行渲染。

> 看到这里，不知道你是否会有什么疑问哈。
> 我有一个很大的疑问？为什么组件 vnode 要绕这个打一个圈子用 render 函数返回呢？直接用一个属性返回不好吗？如下
>
> ```js
> const MyComponent = {
>   name: 'MyComponent',
>   vnode: {
>     type: 'div',
>     children: '我是文本内容',
>   }
> }
> ```
>
> 这样岂不是直接就可以用 vnode 这个属性就可以拿到组件的 vnode 了吗？为啥要绕一个大圈子呢？先买个关子在这里哈，后面就知道为啥了。

```js 
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render } = componentOptions;
  // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode
  const subTree = render();
  // 最后调用 patch 函数来挂载组件所描述的内容，即 subTree
  patch(null, subTree, container, anchor)
}
```

## 12.2 组件状态与自更新
组件的状态要怎么获取到呢？

约定，用户必须使用 data 函数来定义组件自身的状态，同时可以在渲染函数中通过 this 访问由 data 函数返回的状态数据。

这里就能够很好地回答上面遗留的问题了，就是为什么 render 必须是一个函数而不是对象啥的，因为函数才能指定 this，而对象不行。 render 函数可以通过 this 获取到 data 里面的状态（因为是函数，所以可以使用 bind call 来指定）

```js
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render, data } = componentOptions;
  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());
  const queueJob = getQueueJob();
  // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
  // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
  const subTree = render.call(state, state);
  // 最后调用 patch 函数来挂载组件所描述的内容，即 subTree
  patch(null, subTree, container, anchor)
}
```

除了获取状态以外，当状态发生变化时，需要进行相应的更新操作，那么怎么做呢？很简单，直接将更新放到 effect 中，这样，当组件树中的状态发生变化时，能自动地出发更新操作。

只是，需要注意的是，因为触发变化和更新的操作是同步的，也就意味着，多次修改响应式数据的值，将会导致渲染函数执行多次，这实际上是没有必要的。所以可以实现一个调度器来将任务缓存起来，放到微任务里面执行。
> 其实之前就实现过，就是一个调度器的视线

```js
/**
 * 获取调度器
 * @returns 
 */
function getQueueJob() {
  let isFlusing = false;
  const p = Promise.resolve();
  const queue = new Set();
  function queueJob(job) {
    queue.add(job);
    if(!isFlusing) {
      isFlusing = true
      p.then(() => {
        queue.forEach(fn => fn())
      }).finally(() => {
        queue.clear();
        isFlusing = false
      })
    }
  }

  return queueJob;
}

/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render, data } = componentOptions;
  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());
  const queueJob = getQueueJob();
  // 将组件的 render 函数调用包装到  effect 内
  effect(() => {
    // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
    // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
    const subTree = render.call(state, state);
    // 最后调用 patch 函数来挂载组件所描述的内容，即 subTree
    patch(null, subTree, container, anchor)
  }, {
    scheduler(job) {
      queueJob(job)
    }
  })
}
```
但这样还是有些许缺陷的，因为每次 patch 的时候都是 null，相当于说每次都是新的挂载，而不是打补丁，这是不正确的。正确的做法是，每次更新时，都拿新的 subTree 与上一次组件所渲染的 subTree 进行打补丁。为此，我们需要实现组件实例，用它来维护组件的整个生命周期的状态，这行渲染器才能够在正确的时机执行合适的操作。

## 12.3 组件实例与组件的生命周期
组件实例本质就是状态集合，维护着组件运行过程中的所有信息。

```js
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render, data } = componentOptions;
  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());

  // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
  const instance = {
    // 逐渐吱声的状态数据，即 data
    state,
    // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
    isMounted: false,
    // 组件所渲染的内容，即子树
    subTree: null,
  };

  // 将组件实例设置到 vnode 上，这样后续就可以用它来进行更新了
  vnode.component = instance;

  const queueJob = getQueueJob();
  // 将组件的 render 函数调用包装到  effect 内
  effect(() => {
    // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
    // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
    const subTree = render.call(state, state);
    // 检查组件是否已经被挂载
    if(!instance.isMounted) {
      // 初次挂载，调用 patch 函数第一个参数为 null
      patch(null, subTree, container, anchor);
      // 重点，将组件实例的 isMounted 设置为 true，这样当更新发生时就不会再次进行挂载操作
      // 而是会执行更新操作
      instance.isMounted = true;
    } else {
      // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可
      // 所以在调用 patch 函数是，第一个参数为组件上一次渲染的子树
      // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
      patch(instance.subTree, subTree, container, anchor)
    }
    // 更新组件实例的子树
    instance.subTree = subTree;
  }, { scheduler: queueJob })
}
```

生命周期也是一样的，我们只需要在合适的时机调用对应的钩子即可，这里只需要注意调用时机即可

```js
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 获取组件的渲染函数 render
  const { render, data, beforeCreate, created, beforeMount, mounted, beforeUpdate, updated } = componentOptions;

  // 在这里调用 beforeCreate
  beforeCreate && beforeCreate();

  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());

  // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
  const instance = {
    // 逐渐吱声的状态数据，即 data
    state,
    // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
    isMounted: false,
    // 组件所渲染的内容，即子树
    subTree: null,
  };

  // 将组件实例设置到 vnode 上，这样后续就可以用它来进行更新了
  vnode.component = instance;
  
  // 在这里调用 created
  created && created();

  const queueJob = getQueueJob();
  // 将组件的 render 函数调用包装到  effect 内
  effect(() => {
    // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
    // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
    const subTree = render.call(state, state);
    // 检查组件是否已经被挂载
    if(!instance.isMounted) {
      // 在这里调用 beforeMount
      beforeMount && beforeMount();
      // 初次挂载，调用 patch 函数第一个参数为 null
      patch(null, subTree, container, anchor);
      // 在这里调用 mounted
      mounted && mounted();
      // 重点，将组件实例的 isMounted 设置为 true，这样当更新发生时就不会再次进行挂载操作
      // 而是会执行更新操作
      instance.isMounted = true;
    } else {
      // 在这里调用 beforeUpdate
      beforeUpdate && beforeUpdate();
      // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可
      // 所以在调用 patch 函数是，第一个参数为组件上一次渲染的子树
      // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
      patch(instance.subTree, subTree, container, anchor);
      // 在这里调用 updated
      updated && updated();
    }
    // 更新组件实例的子树
    instance.subTree = subTree;
  }, { scheduler: queueJob })
}
```

## 12.4 props 与组件的被动更新

先来看一个示例
```vue
<MyComponent title="A Big Title" :other="val"/>
```

转化成 vnode：

```js
const vnode = {
  type: MyComponent,
  props: {
    title: "A Big Title",
    other: this.val
  }
}
```

MyComponent 选项对象：

```js
const MyComponent = {
  name: 'MyComponent',
  // 组件接收名为 title 的 props，并且该 props 的类型为 String
  props: {
    title: String,
  },
  render() {
    return {
      type: 'div',
      children: `count is: ${this.title}`
    }
  }
}
```

props 共有两个部分：
- 为组件传递的 props 数据，在 vnode 上即 vnode.props
- 组件选项对象中定义的 props 选项，即 MyComponent.props 对象

用这两部分就可以解析出组件在渲染时需要用到的 props 数据。

我们要做的是：
- 在实例上挂载 props，并且它还是浅响应的
- 并不是组件传递的 props 最终都会通过 props 方式挂载，是组件本身定义了的 prop 才会作为 prop 挂载；另外的作为 attrs 

```js
/**
 * 解析组件对象定义的 props 和 组件传递的 props
 * @param {*} options 组件对象定义的 props
 * @param {*} propsData 组件传递的 props
 * @returns [组件的 props，attrs]
 */
function resolveProps(options, propsData) {
  const props = {};
  const attrs = {};

  // 遍历组件传递的 props
  for (const key in propsData) {
    if(key in options) {
      // 如果组件传递的 props 数据在组件自身的 props 选项中有定义，则将其视为合法的 props
      props[key] = propsData[key]
    } else {
      // 否者将其视为 attrs
      attrs[key] = propsData[key]
    }
  }
  return [props, attrs]
}

/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 从组件对象上取出
  const { render, data, props: propsOption, beforeCreate, created, beforeMount, mounted, beforeUpdate, updated } = componentOptions;

  // 在这里调用 beforeCreate
  beforeCreate && beforeCreate();

  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = reactive(data());

  const [props, attrs] = resolveProps(propsOption, vnode.props)

  // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
  const instance = {
    // 组件自身的状态数据，即 data
    state,
    // 将解析出的 props 数据包装为 shallowReactive 并定义到组件的实例上
    props: shallowReactive(props),
    // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
    isMounted: false,
    // 组件所渲染的内容，即子树
    subTree: null,
  };

  // 将组件实例设置到 vnode 上，这样后续就可以用它来进行更新了
  vnode.component = instance;
  //.....
}
```

这里没有做 props 类型的校验以及默认值的处理。但这实现起来并不复杂，都是围绕这 MyComponent.props 以及 vnode.props 这两个对象来展开。

处理完 props 后，需要来实现的是，当 props 发生变化时的处理。

实际上，props 发生变化，触发的是父组件的重新渲染：

```js
<template>
  <MyComponent :title="title" />
</template>
```

vnode 假设如下：

```js
const vnode = {
  type: MyComponent,
  props: {
    title: 'will change'
  }
}
```

在挂载时，会读取 title，所以当 title 发生变化时，会触发父组件的重渲染。即这部分逻辑：

```js
/**
 * 打补丁函数
 * @param {*} n1 旧 vnode
 * @param {*} n2 新 vnode
 * @param {*} container 容器
 */
function patch(n1, n2, container, anchor) {
  // 旧节点存在，同时旧节点类型和新结点类型不一致，说明内容不同
  if(n1 && n1.type !== n2.type) {
    unmountElement(n1);
    n1 = null;
  }

  const { type } = n2;

  // 通过 n2 的类型来决定如何渲染
  if(typeof type === 'string') {
  } else if (type === Text) {
  } else if (type === Comment) {
  } else if (type === Fragment) {
  } else if(isObject(type)) {
    // 如果 n2.type 的值的类型是对象，则描述的是组件
    if(!n1) {
      mountComponent(n2, container, anchor)
    } else {
      patchComponent(n1, n2, anchor)
    }
  } else if(type === 'xxx') {
    // 处理其它类型
  }
}
```

当触发重渲染时，因为是组件，所以会触发子组件的更新，即 `patchComponent`。当子组件发生被动更新时，我们需要做的是：
- 检查子组件是否真的需要更新，因为子组件的 props 可能是不变的
- 如果需要更新，则更新子组件的 props、slots 等内容

来看第一个，怎么判断子组件是否需要更新呢？
很简单，比较一下新的 props 和旧的 props 是否有发生变化
- 新的：odlVNode.props
- 旧的：newVNode.props

```js
/**
 * 为子组件传递的 props 是否发生了变化
 * @param {*} prevProps 旧的 props
 * @param {*} nextProps 新的 props
 * @returns 是否
 */
function hasPropsChanged(prevProps, nextProps) {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if(prevKeys.length !== nextKeys.length) {
    return true;
  }

  for (const key in prevProps) {
    if(prevProps[key] !== nextKeys[key]) {
      return true;
    }
  }

  return false;
}
```
然后实现子组件的更新，因为子组件的 props 对象本身是浅响应的，因为，更新 props 时，就可以触发组件的重渲染 

```js
/**
 * 组件打补丁
 * @param {*} n1 旧 vnode
 * @param {*} n2 新 vnode
 * @param {*} anchor 
 */
function patchComponent(n1, n2, anchor) {
  // 获取组件实例，即 n1.component，同时让新的组件虚拟节点 n2.component 也指向组件实例
  const instance = (n2.component = n1.component);
  // 获取当前的 props 数据
  const { props } = instance;
  // 调用 hasPropsChanged 函数检测子组件传递的 props 是否发生变化，如果没有，则不需要更新
  if(hasPropsChanged(n1.props, n2.props)) {
    // 调用 resolveProps 函数重新获取 props 数据
    const [nextProps] = resolveProps(n2.type.props, n2.props);
    // 更新 props
    for (const key in nextProps) {
      props[key] = nextProps[key]
    }

    // 删除不存在的 props
    for (const key in props) {
      if(!(key in nextProps)) delete props[key]
    }

    // 因为组件实例的 props，即 instance.props 对象本身是浅响应的，因为，更新 props 时，就可以触发组件的重渲染 
  }
}
```

这里实现 props 的处理，但还没有处理 attrs 与 slots 的更新。attrs 和 props 类似。

由于 props 数据与组件自身的状态数据都需要暴露到渲染函数中，并使得渲染函数能够通过 this 访问，因此需要封装一个渲染上下文对象，这样才能通过 this 访问。
通过 proxy 创建完成后，再在各自方法调用时指向即可。
- 组件的 render 函数
- 组件的 method、生命周期函数

```js
/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // ....
  // 将组件实例设置到 vnode 上，这样后续就可以用它来进行更新了
  vnode.component = instance;
  
  const renderContext = new Proxy(instance, {
    get(target, key, receiver) {
      const { state, props } = target;
      if(state && key in state) {
        return state[key]
      } else if(key in props) {
        return props[key]
      } else {
        console.error('not exist')
      }
    },
    set(target, key, newVal, receiver) {
      const { state, props } = target;
      if(state && key in state) {
        state[key] = newVal;
        return true;
      } else if(key in props) {
        console.warn(`Attempting to mutate prop "${key}". Props are readonly.`)
      } else {
        console.error('not exist')
      }
    }
  })
  // 在这里调用 created
  created && created.call(renderContext);

  const queueJob = getQueueJob();
  // 将组件的 render 函数调用包装到  effect 内
  effect(() => {
    // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的 vnode，同时指定 this
    // 从而 render 函数内部就可以通过 this 访问组件自身状态数据
    const subTree = render.call(renderContext, renderContext);
    // 检查组件是否已经被挂载
    if(!instance.isMounted) {
      // 在这里调用 beforeMount
      beforeMount && beforeMount.call(renderContext);
      // 初次挂载，调用 patch 函数第一个参数为 null
      patch(null, subTree, container, anchor);
      // 在这里调用 mounted
      mounted && mounted.call(renderContext);
      // 重点，将组件实例的 isMounted 设置为 true，这样当更新发生时就不会再次进行挂载操作
      // 而是会执行更新操作
      instance.isMounted = true;
    } else {
      // 在这里调用 beforeUpdate
      beforeUpdate && beforeUpdate.call(renderContext);
      // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可
      // 所以在调用 patch 函数是，第一个参数为组件上一次渲染的子树
      // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
      patch(instance.subTree, subTree, container, anchor);
      // 在这里调用 updated
      updated && updated.call(renderContext);
    }
    // 更新组件实例的子树
    instance.subTree = subTree;
  }, { scheduler: queueJob })
}
```

## 12.5 setup 函数的作用与实现

setup 函数是 vue3 提出的，有别于 vue2 中的组件选项，setup 主要配合组合式 api。

setup 函数有两种返回方式：
- 返回一个函数，将作为组件的 render 函数
  ```js
  const Comp = {
    setup() {
      // setup 可以返回一个函数，该函数将作为组件的渲染函数
      return () => {
        return { type: 'div', children: 'hello' }
      }
    }
  }
  ```
  
- 返回一个对象，这个对象中包含的数据将暴露给模板使用

  ```js
  const Comp = {
    setup() {
      const count = ref(0);
      
      // 也可以返回一个对象，对象中的数据会暴露给模板使用
      return {
        count
      }
    },
    render() {
      // 通过 this 可以访问 setup 暴露出来的响应式数据
      return { type: 'div', children: `count is: ${this.count}` }
    }
  }
  ```

除了 setup 函数的返回以外， setup 函数还接收两个参数，第一个是 props 对象，第二个是 setupContext 对象:

```js
const Comp = {
  props: {
    foo: String,
  },
  setup(props, setupContext) {
    props.foo; // 访问传入的 props 数据
    // setupContext 中包含与组件接口相关的重要数据
    const { slots, emit, attrs, expose } = setupContext;
  }
}
```

关于第二个参数 setupContext，它里面包含与组件接口相关的重要数据。
- slots：组件接收到的插槽
- emit：用于发射自定义事件
- attrs
- expose

```js
/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // 通过 vnode 获取组件的选项对象，即 vnode.type
  const componentOptions = vnode.type;
  // 从组件对象上取出
  const { render, data, setup, props: propsOption, beforeCreate, created, beforeMount, mounted, beforeUpdate, updated } = componentOptions;

  //...
  
  // setupContext
  const setupContext = { attrs };
  // 调用 setup 函数，将只读版本的 props 作为第一个参数传递，避免用户意外地修改 props 的值
  // setupContext 作为第二个参数
  const setupResult = setup(shallowReadonly(instance.props), setupContext);
  // setupState 存储由 setup 函数返回的数据
  let setupState = {};
  if(typeof setupResult === 'function') {
    // 如果 setup 返回的是函数，那么将其作为渲染函数
    if(render)
      // 报告冲突
      console.warn('setup 函数返回渲染函数，render 选项将被忽略') 
    render = setupResult;
  } else {
    // 如果不是函数，则作为数据状态赋值给 setupState
    setupState = setupResult;
  }

  // 将组件实例设置到 vnode 上，这样后续就可以用它来进行更新了
  vnode.component = instance;
  
  const renderContext = new Proxy(instance, {
    get(target, key, receiver) {
      const { state, props } = target;
      if(state && key in state) {
        return state[key]
      } else if(key in props) {
        return props[key]
      } else if(key in setupState) {
        // 渲染上下文增加对 setupState 的支持
        return setupState[key]
      } else {
        console.error('not exist')
      }
    },
    set(target, key, newVal, receiver) {
      const { state, props } = target;
      if(state && key in state) {
        state[key] = newVal;
        return true;
      } else if(key in props) {
        console.warn(`Attempting to mutate prop "${key}". Props are readonly.`)
      } else if(key in setupState) {
        // 渲染上下文增加对 setupState 的支持
        setupState[key] = newVal;
        return true;
      } else {
        console.error('not exist')
      }
    }
  })
  // ....
}
```

## 12.6 组件事件与 emit 的实现

emit 主要用于发射组件的自定义事件
```js
const MyComponent = {
  name: 'MyComponent',
  setup(props, { emit }){
    emit('change', 1, 2);

    retur () => {
      return //
    }
  }
}
```

在使用组件时，监听由 emit 函数发射的自定义事件：

```js
<MyComponent @change="handler" />
```

这里对应的 vnode 如下：

```js
const vnode = {
  type: MyComponent,
  props: {
    onChange: handler
  }
}
```

可以看到，change 事件作为 props 传递给了组件，所以 emit 就容易实现了，组件在 props 中找到这个事件，执行即可

```js
/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // ...
  /**
   * 触发组件自定义事件
   * @param {*} event 事件名
   * @param  {...any} payload 载荷
   */
  function emit(event, ...payload) {
    // 根据约定对事件名进行处理，例如 change --> onChange
    const eventName = `on${event[0].toUpperCase()}${event.slice(1)}`;
    const handler = instance.props[eventName];
    if (handler) {
      // 调用事件处理函数并传递参数
      handler(...payload);
    } else {
      console.log('事件不存在');
    }
  }

  // setupContext
  const setupContext = { attrs, emit };
  // ...
}
```

实现还是比较简单的，就是找到对应的事件，然后执行。
但这里有一个点需要注意，那就是在 resolveProps 中，我们将没有在组件 props 选项中定义的 props 放入到了 attrs 中，所以这里需要做一些兼容，就是，在组件选项中定义了的以及以 on 开头的都要放到 props 中，其它的放到 attrs 中。

```js
/**
 * 解析组件对象定义的 props 和 组件传递的 props
 * @param {*} options 组件对象定义的 props
 * @param {*} propsData 组件传递的 props
 * @returns [组件的 props，attrs]
 */
function resolveProps(options = {}, propsData = {}) {
  const props = {};
  const attrs = {};

  // 遍历组件传递的 props
  for (const key in propsData) {
    if(key in options || key.startsWith('on')) {
      // 如果组件传递的 props 数据在组件自身的 props 选项中有定义，则将其视为合法的 props
      // 同时，以字符串 on 开头的 props，无论是否显示地声明，都将其添加到 props 数据中，而不是添加中 attrs 中
      props[key] = propsData[key]
    } else {
      // 否者将其视为 attrs
      attrs[key] = propsData[key]
    }
  }
  return [props, attrs]
}
```

## 12.7 插槽的工作原理与实现
插槽，即在组件中预留一个槽位，这个位置要渲染的内容由用户来插入。

如：MyComponent 组件模板如下
```js
<template>
  <header><slot name="header" /></header>
  <div>
    <slot name="body" />
  </div>
  <footer><slot name="footer" /></footer>
</template>
```
父组件使用 MyComponent 时，可以根据插槽的名字来插入自定义的内容：

```js
<MyComponent>
  <template #header>
    <h1>我是标题</h1>
  </template>
  <template #body>
    <h1>我是内容</h1>
  </template>
  <template #footer>
    <h1>我是注脚</h1>
  </template>
</MyComponent>
```

上面是使用，我们来看看编译后的样子，首先是父组件编译后的渲染函数

```js
// 父组件的渲染函数
function render() {
  return {
    type: MyComponent,
    // 组件的 chilren 会被编译成一个对象
    children: {
      header() {
        return { type: "h1", children: '我是标题' }
      },
      body() {
        return { type: "h1", children: '我是内容' }
      },
      footer() {
        return { type: "h1", children: '我是注脚' }
      }
    }
  }
}
```

可以看到，组件的 chilren 会被编译成一个对象，每一个插槽对应一个函数，即插槽内容会被编译成插槽函数，而插槽函数的返回值就是具体的插槽内容。

我们再来看组件编译后的渲染函数

```js
const MyComponent = {
  render() {
    return [
      {
        type: 'header',
        children: [this.$slot.header()]
      },
      {
        type: 'div',
        children: [this.$slot.body()]
      },
      {
        type: 'footer',
        children: [this.$slot.footer()]
      }
    ]
  }
}
```

可以看到，组件渲染插槽的过程，就是调用插槽函数并渲染由其返回的内容的过程。

这里用了 `this.$slot` 来获取插槽函数，所以运行时是依赖 `$slot` 的，那么渲染上下文也应当支持。

```js
/**
 * 挂载组件
 * @param {*} vnode 
 * @param {*} container 
 * @param {*} anchor 
 */
function mountComponent(vnode, container, anchor) {
  // ...
  // 直接使用编译后的 vnode.children 对象作为 slots 对象即可
  const slots = vnode.children || {};

  // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
  const instance = {
    // 组件自身的状态数据，即 data
    state,
    // 将解析出的 props 数据包装为 shallowReactive 并定义到组件的实例上
    props: shallowReactive(props),
    // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
    isMounted: false,
    // 组件所渲染的内容，即子树
    subTree: null,
    slots,
  };
  
  // setupContext
  const setupContext = { attrs, emit, slots };
  
  // ...
  
  const renderContext = new Proxy(instance, {
    get(target, key, receiver) {
      const { state, props, slots } = target;
      if(key === '$slot') {
        // 当 key 为 $slots 时，直接返回组件实例上的 slots
        return slots;
      } else if(state && key in state) {
        return state[key]
      } else if(key in props) {
        return props[key]
      } else if(key in setupState) {
        // 渲染上下文增加对 setupState 的支持
        return setupState[key]
      } else {
        console.error('not exist')
      }
    },
    set(target, key, newVal, receiver) {
      const { state, props } = target;
      if(state && key in state) {
        state[key] = newVal;
        return true;
      } else if(key in props) {
        console.warn(`Attempting to mutate prop "${key}". Props are readonly.`)
      } else if(key in setupState) {
        // 渲染上下文增加对 setupState 的支持
        setupState[key] = newVal;
        return true;
      } else {
        console.error('not exist')
      }
    }
  })
  // ...
}
```
