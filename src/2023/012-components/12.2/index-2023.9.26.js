import LIS from "./longest-increasing-subsquence.js";
import { reactive, effect } from "../reactivity.js";

function isString(str) {
  return typeof str === 'string';
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]'
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
    setComment 
  } = options;
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
    insert(el, container, anchor)
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
    }
    // 根据 vnode 获取要卸载的真实 DOM 元素
    const el = vnode.el;
    // 获取真实 DOM 的父元素
    const parent = el.parentNode;
    if(parent) unmount(el, parent)
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

    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];

    // 相同的前置节点
    while(oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container)
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }

    let oldEndIdx = oldChildren.length - 1;
    let newEndIdx = newChildren.length - 1;
    oldVNode = oldChildren[oldEndIdx];
    newVNode = newChildren[newEndIdx];

    // 相同的后置节点
    while(oldVNode.key === newVNode.key) {
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
   * 更新元素，走到这里，说明新旧 vnode 类型是一致的，即是同一种节点元素或组件
   * @param {*} n1 旧 vnode
   * @param {*} n2 新 vnode
   */
  function patchElement(n1, n2) {
    const el = n2.el = n1.el;
    // 先更新属性
    const oldProps = n1.props || {};
    const newProps = n2.props || {};
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
    
    // 更新子节点
    patchChildren(n1, n2, el)
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

  return {
    render
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
  }
});

const MyComponent = {
  name: 'MyComponent',
  data(){
    return {
      foo: 'hello world'
    }
  },
  render() {
    return {
      type: 'div',
      children: `foo 的值是：${this.foo}`,
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

setTimeout(() => {
  
}, 3000);

renderer.render(vnode, document.querySelector('#app'));
