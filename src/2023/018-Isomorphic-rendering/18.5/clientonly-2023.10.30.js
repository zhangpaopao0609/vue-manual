function createRenderer(options) {
  function render() {

  }

  /**
   * 挂载组件
   * @param {*} vnode 
   * @param {*} container 
   * @param {*} anchor 
   */
  function mountComponent(vnode, container, anchor) {
    // 通过 vnode 获取组件的选项对象，即 vnode.type
    let componentOptions = vnode.type;
    if (isFunction(componentOptions)) {
      // 如果是函数式组件，将 vnode.type 作为渲染函数，将 vnode.type.props 作为 props 选项定义即可
      componentOptions = {
        render: vnode.type,
        props: vnode.type.props
      }
    }
    // 从组件对象上取出
    const { render, data, setup, props: propsOption, beforeCreate, created, beforeMount, mounted, beforeUpdate, updated } = componentOptions;

    // 在这里调用 beforeCreate
    beforeCreate && beforeCreate();

    // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
    const state = reactive(data());

    const [props, attrs] = resolveProps(propsOption, vnode.props)
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
      mounted: [],
      // 只有 KeepAlive 组件的实例下会有 keepAliveCtx 属性
      keepAliveCtx: null,
    };

    // 检查当前组件是否是 KeepAlive 组件
    const isKeepAlive = vnode.type._isKeepAlive;
    if (isKeepAlive) {
      // 在 KeepAlive 组件实例上添加 keepAliveCtx 对象
      instance.keepAliveCtx = {
        // move 函数用来移动一段 vnode
        move(vnode, container, anchor) {
          // 本质上是将组件渲染的内容移动到指定容器中，即隐藏容器中
          insert(vnode.component.subTree.el, container, anchor)
        },
        createElement,
      }
    }

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
    const setupContext = { attrs, emit, slots };
    setCurrentInstance(instance);
    // 调用 setup 函数，将只读版本的 props 作为第一个参数传递，避免用户意外地修改 props 的值
    // setupContext 作为第二个参数
    const setupResult = setup(shallowReadonly(instance.props), setupContext);
    setCurrentInstance(null);
    // setupState 存储由 setup 函数返回的数据
    let setupState = {};
    if (typeof setupResult === 'function') {
      // 如果 setup 返回的是函数，那么将其作为渲染函数
      if (render)
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
        const { state, props, slots } = target;
        if (key === '$slot') {
          // 当 key 为 $slots 时，直接返回组件实例上的 slots
          return slots;
        } else if (state && key in state) {
          return state[key]
        } else if (key in props) {
          return props[key]
        } else if (key in setupState) {
          // 渲染上下文增加对 setupState 的支持
          return setupState[key]
        } else {
          console.error('not exist')
        }
      },
      set(target, key, newVal, receiver) {
        const { state, props } = target;
        if (state && key in state) {
          state[key] = newVal;
          return true;
        } else if (key in props) {
          console.warn(`Attempting to mutate prop "${key}". Props are readonly.`)
        } else if (key in setupState) {
          // 渲染上下文增加对 setupState 的支持
          setupState[key] = newVal;
          return true;
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
      if (!instance.isMounted) {
        // 在这里调用 beforeMount
        beforeMount && beforeMount.call(renderContext);
        if (vnode.el) {
          // 如果 el 已经存在，那么说明要执行激活
          hydrateNode(vnode.el, subTree);
        } else {
          // 初次挂载，调用 patch 函数第一个参数为 null
          patch(null, subTree, container, anchor);
        }
        // 在这里调用 mounted
        mounted && mounted.call(renderContext);
        // 遍历 instance.mounted 并逐个执行即可
        instance.mounted.forEach(cb => cb.call(renderContext))
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

  /**
   * 激活普通元素类型的节点
   * @param {*} el 
   * @param {*} vnode 
   */
  function hydrateElement(el, vnode) {
    // 1. 为 DOM 元素添加事件
    const { props, children } = vnode;
    if (props) {
      for (const key in props) {
        if (/^on/.test(key)) {
          patchProps(el, key, null, props[key])
        }
      }
    }

    // 2. 递归地激活子节点
    if (Array.isArray(children)) {
      children.reduce(
        (nextNode, child) => hydrateNode(nextNode, child),
        el.firstChild,
      )
    }
  }

  /**
   * 激活节点
   * @param {*} node 
   * @param {*} vnode 
   * @returns node 的下一个兄弟节点
   */
  function hydrateNode(node, vnode) {
    const { type } = vnode;
    // 1. vnode.el 引用真实 DOM
    vnode.el = node;

    // 2. 检查 vnode 的类型
    if (typeof type === 'object') {
      // 组件
      mountComponent(vnode, container, null)
    } else if (typeof type === 'string') {
      // 标签
      // 3. 检查真实 DOM 类型与 虚拟 DOM 类型是否一致
      if (node.nodeType !== 1) {
        console.error('mismatch');
        console.error('服务端渲染的真实 DOM 节点是：', node);
        console.error('客户端渲染的真实 DOM 节点是：', vnode);
      } else {
        // 4. 普通元素，调用 hydrateElement 完成激活
        hydrateElement(node, vnode)
      }
    }
    // 5. 重要： hydrateNode 函数需要返回当前节点的下一个兄弟节点，以便继续进行后续的激活操作
    return node.nextSibling;
  }

  function hydrate(vnode, container) {
    // 从容器元素的第一个子节点开始
    hydrateNode(container.firstChild, vnode)
  }
  /**
   * ClientOnly 组件
   */
  const ClientOnly = {
    setup(_, { slots }) {
      // 标记变量，仅在客户端渲染时为 true
      const show = ref(false);
      // onMounted 仅会在客户端执行
      onMounted(() => {
        show.value = true
      })
      return () => show && slots.default ? slots.default() : null; 
    }
  }

  return {
    render,
    hydrate,
    ClientOnly
  }
}