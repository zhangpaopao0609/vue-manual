import LIS from "./longest-increasing-subsquence.js";
import { reactive, effect, shallowReactive, ref, shallowReadonly } from "../reactivity.js";

function isString(str) {
  return typeof str === 'string';
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

function isFunction(obj) {
  return Object.prototype.toString.call(obj) === '[object Function]'
}

// 文本节点的 type 标识
const Text = Symbol();
// 注释节点的 type 标识
const Comment = Symbol();
// Fragment 的 type 标识
const Fragment = Symbol();

function createRenderer(options) {
  const { 
    createElement, 
    insert, 
    setElementText, 
    patchProps, 
    unmount, 
    createText, 
    setText, 
    createComment, 
    setComment,
    nextFrame,
  } = options;
  // 用于存储当前的组件实例
  let currentInstance = null;
  /**
   * 挂载操作
   * @param {*} vnode 
   * @param {*} container 
   */
  function mountElement(vnode, container, anchor) {
    // 让 vnode 引用真实 dom 元素
    const el = vnode.el = createElement(vnode.type);
    const props = vnode.props;
    if(props && isObject(props)) {
      for (const key in props) {
        patchProps(el, key, null, props[key])
      }
    }
    const children = vnode.children;
    // 如果子节点是字符串，代表元素具有文本节点
    if (typeof children === 'string') {
      // 因此只需要设置元素的 textContent 属性即可
      setElementText(el, children)
    } else if (isArray(children)) {
      children.forEach(child => {
        patch(null, child, el)
      });
    }

    // 判断一个 vnode 是否需要过渡
    const needTransition = vnode.transition;
    if(needTransition) {
      // 调用 transition.beforeEnter 钩子
      vnode.transition.beforeEnter(el)
    };
    insert(el, container, anchor);
    if(needTransition) {
      // 调用 transition.enter 钩子
      vnode.transition.enter(el)
    };
  }
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
      if(vnode.shouldKeepAlive) {
        // 对于需要被 KeepAlive 的组件，我们不应该真的卸载它，而是应该调用该组件的父组件
        // 即 KeepAlive 组件的 _deActivate 函数使起失活
        vnode.keepAliveInstance._deActivate(vnode)
      } else {
        // 对于组件的卸载，本质上是要卸载组件所渲染的内容，即 subTree
        unmountElement(vnode.component.subTree)
      }
    }
    // 根据 vnode 获取要卸载的真实 DOM 元素
    const el = vnode.el;
    // 获取真实 DOM 的父元素
    const parent = el.parentNode;
    if(parent)  {
      const performRemove = () => unmount(el, parent)
      if(vnode.transition) {
        vnode.transition.leave(el, performRemove)
      } else {
        performRemove()
      }
    }
  }
  /**
   * 两个子节点均为数组时，进行双端 diff
   * @param {*} n1 
   * @param {*} n2 
   * @param {*} container 
   */
  function patchKeyedChildren(n1, n2, container) {
    const oldChildren = n1.children;
    const newChildren = n2.children;

    const l1 = oldChildren.length;
    const l2 = newChildren.length;

    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];
    
    // 相同的前置节点
    while(j < l1 && j < l2 && oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container)
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }

    let oldEndIdx = l1 - 1;
    let newEndIdx = l2 - 1;
    oldVNode = oldChildren[oldEndIdx];
    newVNode = newChildren[newEndIdx];

    // 相同的后置节点
    while(j <= oldEndIdx && j <= newEndIdx && oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container)
      oldEndIdx--;
      newEndIdx--;
      oldVNode = oldChildren[oldEndIdx];
      newVNode = newChildren[newEndIdx];
    }

    if(j > newEndIdx && j <= oldEndIdx) {
      // 说明新结点已经 patch 完了，但还有遗留的旧节点，那么卸载掉
      while(j <= newEndIdx) {
        unmountElement(oldChildren[j++]);
      }
    } else if (j > oldEndIdx && j <= newEndIdx) {
      // 说明旧结点已经 patch 完了，但还有遗留的新节点，那么挂载上
      const anchor = oldChildren[newEndIdx+1] ? oldChildren[newEndIdx+1].el : null;
      while(j <= newEndIdx) {
        patch(null, newChildren[j++], anchor);
      }
    } else if(j <= oldEndIdx && j <= newEndIdx){
      const count = newEndIdx - j + 1;
      // 用于记录新结点在旧子节点中的索引
      const sources = new Array(count).fill(-1);
      const keyIndex = {};
      for (let i = j; i <= newEndIdx; i++) {
        keyIndex[newChildren[i].key] = i;
      };

      let lastIndex = j;
      let moved = false;
      let patched = 0;
      for (let i = j; i <= oldEndIdx; i++) {
        const oldVNode = oldChildren[i];
        if(patched < count) {
          const res = keyIndex[oldVNode.key];
          if(res !== undefined) {
            // 说明有
            const newVNode = newChildren[res]
            patch(oldVNode, newVNode, container);
            sources[res-j] = i;
            if(i < lastIndex) {
              moved = true;
            } else {
              lastIndex = i;
            }
          } else {
            // 说明没有，卸载
            unmountElement(oldVNode)
          }
        } else {
          unmountElement(oldVNode)
        }
      }

      if(moved) {
        const seq = LIS(sources);
        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1;
        // i 指向新的一组子节点的最后一个元素
        let i = count - 1;
        for(i; i>= 0; i--) {
          if(seq[s] === -1) {
            // 说明索引为 i 的节点是全新的节点，应该将其挂载
            // 该节点在新 children 中的真实位置索引
            const pos = i + j;
            const newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 挂载
            patch(null, newVNode, container, anchor);
          } else if(i !== seq[s]) {
            // 如果节点的索引 i 不等于 seq[s] 的值，说明节点需要移动
            // 该节点在新 children 中的真实位置索引
            const pos = i + j;
            const newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor = nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 挂载
            insert(newVNode.el, container, anchor);
          } else {
            // 当 i === seq[s] 时，说明该位置的节点不需要移动
            // 只需要让 s 指向下一个位置
            s--;
          }
        }
      }
    }
  }
  /**
   * 更新子节点
   * @param {*} n1 旧节点 oldVNode
   * @param {*} n2 新节点 newVNode
   * @param {*} container 容器
   */
  function patchChildren(n1, n2, container) {
    const oldChildren = n1.children;
    const newChildren = n2.children;

    if (isString(newChildren)) {
      // 如果新子节点是文本
      // 那么如果旧子节点是 空 或者 文本，都不用处理，直接设置 container 的文本为新子节点即可，所以只需要处理旧子节点为数组的情况

      if(isArray(oldChildren)) {
        // 旧子节点为数组，那么全部卸载即可
        oldChildren.forEach(child => unmountElement(child))
      } 
      setElementText(container, newChildren)
    } else if (isArray(newChildren)) {
      // 如果新子节点是数组
      // 那么如果旧子节点是 空，就不用处理，如果为 文本，可以直接将文本清空，然后挂载新子节点，所以仍旧只需要处理旧子节点为数组的情况
      if(isArray(oldChildren)) {
        patchKeyedChildren(n1, n2, container);
      } else if (isString(oldChildren)) {
        setElementText(container, '');
        newChildren.forEach(child => patch(null, child, container));
      } else {
        newChildren.forEach(child => patch(null, child, container));
      }
    } else {
      // 如果新子节点为空
      // 那么只需要处理旧子节点为数组的情况
      if(isArray(oldChildren)) {
        // 旧子节点为数组，全部卸载
        oldChildren.forEach(child => unmountElement(child));
      } 
      setElementText(container, '');
    }
  }
  /**
   * 更新 block
   * @param {*} n1 
   * @param {*} n2 
   */
  function patchBlockChildren(n1, n2) {
    for (let i = 0; i < n2.dynamicChildren.length; i++) {
      patchElement(n1.dynamicChildren[i], n2.dynamicChildren[i])
    }
  }
  /**
   * 更新元素，走到这里，说明新旧 vnode 类型是一致的，即是同一种节点元素或组件
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   */
  function patchElement(n1, n2) {
    const el = n2.el = n1.el;
    // 先更新属性
    const oldProps = n1.props || {};
    const newProps = n2.props || {};

    if (n2.patchFlag) { // ! 书上写的是 patchFlags，感觉又写错了
      // 利用 patchFlags 实现动态节点的靶向更新属性
      const { patchFlag } = n2
      if (patchFlag & 1) {
        // 说明文本是动态的，先不处理
      }
      if (patchFlag & 2) {
        // 说明 class 是动态的，处理 calss 即可
      }
      if (patchFlag & 4) {
        // 说明 class 是动态的，处理 style 即可
      }
      // ... 继续，靶向处理完所有的类型
    } else {
      // 如果没有 patchFlag，那么全量处理

      // 挂载属性，如果新旧属性值一致，就不用动了，否者更新
      for (const key in newProps) {
        if (newProps[key] !== oldProps[key]) {
          patchProps(el, key, null, newProps[key])
        }
      }

      // 卸载旧属性，如果属性在旧中有，但新的没有，那么便卸载掉属性
      for (const key in oldProps) {
        if(!(key in newProps)) {
          patchProps(el, key, null, null)
        }
      }
    }

    // 处理完属性后，继续处理 children
    if(n2.dynamicChildren) {
      // 调用 patchBlockChildren 函数这样只会更新动态节点
      patchBlockChildren(n1, n2);
    } else {
      // 更新子节点
      patchChildren(n1, n2, el);
    }
  }
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
  /**
   * 设置当前实例
   * @param {*} instance 
   */
  function setCurrentInstance(instance) {
    currentInstance = instance;
  }
  /**
   * 生命周期函数 —— onMounted
   * @param {*} fn 
   */
  function onMounted(fn) {
    if(currentInstance) {
      // 将生命周期函数添加到 instance.mounted 数据中
      currentInstance.mounted.push(fn);
    } else {
      console.warn('onMounted 函数只能在 setup 函数中调用')
    }
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
    if(isFunction(componentOptions)) {
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
    if(isKeepAlive) {
      // 在 KeepAlive 组件实例上添加 keepAliveCtx 对象
      instance.keepAliveCtx = {
        // move 函数用来移动一段 vnode
        move(vnode, container, anchor){
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
      // 说明是普通标签元素
      if(!n1) {
        mountElement(n2, container, anchor)
      } else {
        // 能走到这里，说明 n1 和 n2 的类型相同，如果不相同， n1 就为 null 了
        // 说明是普通标签元素
        patchElement(n1, n2)
      }
    } else if (type === Text) {
      // 说明是文本节点
      if(!n1) {
        const el = n2.el = createText(n2.children);
        // 将文本节点插入到容器中
        insert(el, container)
      } else {
        const el = n2.el = n1.el;
        if(n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (type === Comment) {
      // 说明是注释节点
      if(!n1) {
        const el = n2.el = createComment(n2.children);
        // 将注释节点插入到容器中
        insert(el, container)
      } else {
        const el = n2.el = n1.el;
        if(n2.children !== n1.children) {
          setComment(el, n2.children)
        }
      }
    } else if (type === Fragment) {
      // 说明是 Fragment 节点
      if(!n1) {
        // 渲染子节点
        n2.children.forEach(child => patch(null, child, container))
      } else {
        patchChildren(n1, n2, container)
      }
    } else if(isObject(type) && type.__isTeleport) {
      // 组件选项中如果存在 __isTeleport 标识，则它是 Teleport 组件，
      // 调用 Teleport 组件渲染中的 process 函数将控制权交出去
      // 传递给 process 函数的第五个参数是渲染器的内部方法
      type.process(n1, n2, container, anchor, {
        patch,
        patchChildren,
        unmount,
        move(vnode, container, anchor) {
          insert(vnode.component ? vnode.component.subTree.el : vnode.el, container, anchor)
        }
      })
    } else if(isObject(type) || isFunction(type)) {
      // 如果 n2.type 的值的类型是对象，则描述的是有状态组件
      // 如果 n2.type 的值的类型是对象，则描述的是函数式组件
      if(!n1) {
        if(n2.keptAlive) {
          // 如果该组件已经被 KeepAlive，则不会重新挂载它，而是会调用 _activate 来激活它
          n2.keepAliveInstance._activate(n2, container, anchor);
        } else {
          mountComponent(n2, container, anchor)
        }
      } else {
        patchComponent(n1, n2, anchor);
      }
    } else if(type === 'xxx') {
      // 处理其它类型
    }
  }
  /**
   * 渲染函数
   * @param {*} vnode 要渲染的 vnode
   * @param {*} container 容器
   */
  function render(vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与就 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载 （unmount） 操作
        // 根据 vnode 获取要卸载的真实 DOM 元素
        unmountElement(container._vnode)
      }
    }
    // 把 vnode 存在 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode;
  }
  /**
 * 高阶组件，定义异步组件，接收一个异步组件作为参数
 * @param {*} options 
 * @returns 返回一个组件
 */
  function defineAsyncComponent(options) {
    if(typeof options === 'function') {
      options = { loader: options }
    }

    const { loader, delay, loadingComponent, timeout, errorComponent, onError } = options;

    // 一个变量，用于存储异步加载的组件
    let InnerComp = null;
    // 记录重试次数
    let retries = 0;

    function load() {
      return loader()
        .catch((error) => {
          if(onError) {
            // 如果用户提供了 onError 回调，则将控制权交给用户
            return new Promise((resolve, reject) => {
              // 重试
              const retry = () => {
                resolve(load());
                retries++;
              }
              // 失败
              const fail = () => reject(error);
              // 作为 onError 回调函数的参数，让用户来决定下一步怎么做
              onError(retry, fail, retries)
            })
          } else {
            throw error;
          }
        })
    }

    return {
      name: 'AsyncComponentWrapper',
      setup() {
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

        // 调用 load 函数加载组件
        // 加载成功后，将加载成功的组件赋值给 InnerComp，并将 loaded 标记为 true
        load()
          .then((comp) => {
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
  /** KeepAlive 组件 */
  const KeepAlive = {
    name: 'KeepAlive',
    // KeepAlive 组件独有的属性，用作标识
    _isKeepAlive: true,
    props: {
      include: RegExp,
      exclude: RegExp,
    },
    setup(props, { slots }) {
      // 缓存，用于缓存组件 vnode
      const cache = new Map();
      // 当前 KeepAlive 组件的实例
      const instance = currentInstance;
      // 对于 KeepAlive 组件组件来说，它的实例上存在特殊的 keepAliveCtx 对象，该对象由渲染器注入
      // 该对象会暴露渲染器的一些内容方法，其中 move 函数用来将一段 DOM 移动到另一个容器中
      const { move, createElement } = instance.keepAliveCtx;
      // 创建隐藏容器
      const storageContainer = createElement('div');

      // KeepAlive 组件的实例上会被添加两个内部函数，分别是 _deActivate 和 _activate
      // 这两个函数会在渲染器中被调用
      instance._deActivate = (vnode) => {
        move(vnode, storageContainer);
      }
      instance._activate = (vnode, container, anchor) => {
        move(vnode, container, anchor);
      }

      return () => {
        // KeepAlive 的默认插槽就是要被 KeepAlive 的组件
        let rawVNode = slots.default();
        // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被 KeepAlive
        if(!isObject(rawVNode.type)) {
          return rawVNode;
        }
        // 获取“内部组件”的 name
        const name = rawVNode.type.name;
        if(
          name &&
          (
            // 如果 name 无法被 include 匹配
            (props.include && !props.include.test(name)) ||
            // 或者被 exclude 匹配，说明不希望被缓存
            (props.exclude && props.exclude.test(name))
          )
        ) {
          // 则直接渲染 “内部组件”
          return rawVNode;
        }

        // 在挂载时先获取缓存的组件 vnode
        const cachedVNode = cache.get(rawVNode.type);
        if(cachedVNode) {
          // 如果有缓存的内容，则说明不应该执行挂载，而应该执行激活
          // 继承组件实例
          rawVNode.component = rawComp.component;
          // 在 vnode 上添加 keptAlive 属性，标记为 true，避免渲染器重新挂载它
          rawVNode.keptAlive = true;
        } else {
          // 如果没有缓存，则将其添加到缓存中，这样下次激活组件时就不会执行新的挂载动作了
          cache.set(rawVNode.type, rawVNode)
        }
        // 在组件 vnode 上添加 shouldKeepAlive 属性，并标记为 true，避免渲染器真的将组件卸载
        rawVNode.shouldKeepAlive = true;
        // 将 KeepAlive 组件的示例也添加到 vnode 上，以便在渲染器中访问
        rawVNode.keepAliveInstance = instance;

        // 渲染组件 vnode
        return rawVNode;
      }
    }
  }
  /** Teleport 组件 */
  const Teleport = {
    __isTeleport: true,
    process(n1, n2, container, anchor, internals) {
      // 通过 internals 可以获取渲染器的内部方法
      const {
        patch,
        patchChildren,
        move,
      } = internals;

      const { to } = n2.props
      const target = isString(to) ?  document.querySelector(to) : to;

      if(!n1) {
        n2.forEach(child => patch(null, child, target, anchor))
      } else {
        // 更新
        patchChildren(n1, n2, container);
        const { to: n1_to } = n1.props
        if(to !== n1_to) {
          // 即 to 发生了变化，那么应当 move
          n2.forEach(child => move(child, target))
        }
      }
    } 
  }
  /** Transition */
  const Transition = {
    name: 'Transition',
    setup(props, { slots }) {
      const innerVNode = slots.default();

      innerVNode.transition = {
        beforeEnter(el) {
          // 设置初始状态：添加 enter-form 和 enter-active 类
          el.classList.add('enter-from');
          el.classList.add('enter-active');
        },
        enter(el) {
          // 在下一帧切换到结束状态
          nextFrame(() => {
            // 移除
            el.classList.remove('enter-from');
            // 添加
            el.classList.add('enter-to');

            // 动画结束后移除元素状态和运动过程
            el.addEventListener('transitionend', () => {
              el.classList.remove('enter-to')
              el.classList.remove('enter-active')
            })
          });
        },
        leave(el, performRemove) {
          // 设置离场过渡的初始状态：添加 leave-from 和 leave-active
          el.classList.add('leave-from');
          el.classList.add('leave-active');

          // 在下一帧切换元素的状态
          nextFrame(() => {
            // 移除
            el.classList.remove('leave-from');
            // 添加
            el.classList.add('leave-to');

            // 动画结束后移除元素状态和运动过程
            el.addEventListener('transitionend', () => {
              el.classList.remove('leave-to');
              el.classList.remove('leave-active');
              // 当过渡完成后，将 DOM 元素移除
              performRemove();
            })
          });
        }
      }

      return innerVNode;
    }
  }
  return {
    render,
    currentInstance,
    onMounted,
    defineAsyncComponent,
    KeepAlive,
    Teleport,
    Transition
  }
}

// 用 in 操作符判断 key 是否存在对应的 DOM Properties
function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if(key === 'form' && el.tagName === 'INPUT') return false;
  // 兜底
  return key in el
}

function normalizeClass(value) {
  let res = ''
  if (isString(value)) {
    res = value
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}

const renderer = createRenderer({
  /**
   * 浏览器平台用于创建元素
   * @param {*} tag 标签
   * @returns 返回元素
   */
  createElement(tag) {
    return document.createElement(tag)
  },
  /**
   * 设置元素的文本节点
   * @param {*} el 元素
   * @param {*} text 文本
   */
  setElementText(el, text) {
    el.textContent = text
  },
  createText(text) {
    return document.createTextNode(text);
  },
  setText(el, text) {
    el.nodeValue = text;
  },
  createComment(comment) {
    return document.createComment(comment);
  },
  setComment(el, comment) {
    el.nodeValue = comment;
  },
  /**
   * 在给定的 parent 下添加指定元素
   * @param {*} el 
   * @param {*} parent 
   * @param {*} anchor 
   */
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  /**
   * 为元素设置属性
   * @param {*} el 
   * @param {*} key 
   * @param {*} value 
   */
  patchProps(el, key, prevValue, nextValue) {
    if(/^on/.test(key)) {
      // 事件名
      const name = key.slice(2).toLowerCase();
      // 事件对象 结构为 name -> handler
      const invokers = el._vei || (el._vei = {});
      // 当前事件对应的 handler
      let invoker = invokers[name];
      // 如果还有事件
      if(nextValue) {
        // 如果之前没有绑定过事件
        if(!invoker) {
          // 如果没有，那么创建
          // 这里面就比较巧妙了，invoker 作为外层事件用于绑定，内层真正执行的是用户绑定的事件函数，这个事件函数用 invoker value 属性来记录，
          // 这样的好处时，当用户绑定的事件函数变化时，不需要重新绑定了，只需要更新 invoker value 属性就可以了，简直不要太巧妙
          invoker = el._vei[name] = (e) => {
            if(isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e))
            } else {
              invoker.value(e)
            }
          };
          invoker.value = nextValue;
          // 记录抽时间你处理函数被绑定的时间
          invoker.attached = Date.now();
          el.addEventListener(name, (e) => {
            if(!e._vts) {
              // 事件触发的时间
              e._vts = Date.now();
            } else if (e._vts <= invoker.attached) {
              // 如果事件触发的时间早于时间绑定的时间，也即是说，事件触发在前，绑定在后，那么便不执行
              return
            }
            invoker(e)
          });
        } else {
          // 如果已经有，那么更新值即可
          invoker.value = nextValue; 
        }
      } else if(invoker){
        // 没有，此时应该移除事件
        el.removeEvenetListener(name, invoker)
      }
    } else if(key === 'class') {
      el.className = nextValue || '';
    } else if (shouldSetAsProps(el, key, nextValue)) {
      // 如果为布尔类型并且 nextValue 为空字符时，矫正为 true
      if(typeof el[key] === 'boolean' && nextValue === '') {
        el[key] = true;
      } else {
        el[key] = nextValue
      }
    } else {
      // 如果要被设置的属性没有对应的 DOM Properties，则使用 setAttribute 函数设置属性
      el.setAttribute(key, nextValue);
    }
  },
  unmount(el, parent) {
    parent.removeChild(el)
  },
  /**
   * 下一帧
   * @param {*} cb 
   */
  nextFrame(cb) {
    requestAnimationFrame(cb)
  }
});

const MyComponent = {
  name: 'MyComponent',
  props: {
    value: 0,
  },
  data(){
    return {
      foo: 1
    }
  },
  render() {
    return {
      type: 'div',
      key: 'parent',
      children: [
        {
          type: 'div',
          key: 'children',
          props: {
            ff: 1,
            onClick: () => this.foo++
          },
          children: [
            {
              type: 'p',
              children: `foo 的值是：${this.foo}`
            },
            {
              type: 'p',
              children: `父组件传递的 props 的值是：${this.value.value}`
            }
          ],
        }
      ]
    }
  },
  setup(props, setupContext) {
    const { emit } = setupContext;
    setTimeout(() => {
      emit('click')
    }, 2000);
  }
}

const data = ref(1001)

const vnode = {
  type: "div",
  props: {
    onClick: () => data.value++
  },
  children: [
    { type: 'p', children: '我是 p ', key: 1 },
    { type: MyComponent, key: 'MyComponent', props: { value: data, onClick: () => alert('子组件触发了自定义事件') } }
  ]
}

renderer.render(vnode, document.querySelector('#app'));
