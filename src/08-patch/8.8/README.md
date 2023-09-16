# 8 挂载和更新

## 8.1 挂载子节点和元素的属性

```js
const vnode = {
  type: 'div',
  props: {
    id: 'foo'
  },
  children: [
    {
      type: 'p',
      children: 'hello'
    }
  ]
}
```

vnode 结构如下，那么响应地进行处理即可。

```js
function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isObject(obj) {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

function createRenderer(options) {
  const { createElement, insert, setElementText, setElementProps } = options;
  /**
   * 挂载操作
   * @param {*} vnode 
   * @param {*} container 
   */
  function mountElement(vnode, container) {
    const el = createElement(vnode.type);
    const props = vnode.props;
    if(props && isObject(props)) {
      for (const key in props) {
        setElementProps(el, key, props[key])
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
    insert(el, container)
  }
  ...
}

const renderer = createRenderer({
  ...
  /**
   * 为元素设置属性
   * @param {*} el 
   * @param {*} key 
   * @param {*} value 
   */
  setElementProps(el, key, value) {
    el.setAttribute(key, value);
  }
});
renderer.render(vnode, document.querySelector('#app'));
```

## 8.2 HTML Attributes and DOM Properties

HTML Attributes 的所用是设置与之对应的 DOM Properties 的初始值。

## 8.3 正确地设置元素属性

比如 `disabled` 属性

```html
<button disabled>Button</button>
```

把它用 vnode 来表示：

```js
const button = {
  type: 'button',
  props: {
    disabled: ''
  }
};
```

这里的 disabled 为空字符串，按照属性设置 

```js
el.setAttribute('disabled', '')
```

这样是没啥问题，但是如果是下面这样呢？

```html
<button disabled="false">Button</button>
```

vnode 如下：

```js
const button = {
  type: 'button',
  props: {
    disabled: false
  }
};
```

按照属性设置 

```js
el.setAttribute('disabled', false)
```

看起来没啥问题哈，但是在浏览器中运行就会发现，按钮被禁用了。

**因为，使用 setAttribute 函数设置的值总会被字符串化**，所以上面这句话相当于：

```js
el.setAttribute('disabled', 'false')
```

对于按钮来说， `el.disabled` 是一个布尔类型的，并且它不关心具体的 HTML Attributes 的值是什么，只要 disabled 属性存在，按钮就会被禁用。所以发现，渲染器不应该总是用 setAttribute 函数将 vnode.props 对象中的属性设置到元素上，那么应该怎么办呢？一个自然的思路是，可以优先设置 DOM Properties：

```js
el.disabled = false;
```

但这样还有点问题的，比如 值为空的时候

```js
el.disabled = '';
```

由于 disabled 是布尔类型的，所以经过类型转换，空值会被转化为 false，但这并不是预期想要的结果，所以空值需要单独处理一下，将空值矫正为 true。

```js
setElementProps(el, key, value) {
  // 用 in 操作符判断 key 是否存在对应的 DOM Properties
  if (key in el) {
    // 如果为布尔类型并且 value 为空字符时，矫正为 true
    if(typeof el[key] === 'boolean' && value === '') {
      el[key] = true;
    }  else {
      el[key] = value
    }
  } else {
    // 如果要被设置的属性没有对应的 DOM Properties，则使用 setAttribute 函数设置属性
    el.setAttribute(key, value);
  }
}
```

但这样做还有有一些问题的，因为有些 DOM Properties 是只读的，比如 el.form

```html
<form id="form1"></form>
<input form="form1" />
```

input 上的 form 属性（HTML Attributes）。它对应的 DOM Properties 就是 el.form，但它是只读的，因此只能通过 setAttribute 函数来设置它，所以这也需要我们做兼容

```js
function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if(key === 'form' && el.tagName === 'INPUT') return false;
  // 兜底
  return key in el
}
```


## 8.4 处理 class

vue 中有多种方式支持 calss

- 字符串
```vue
<div class="foo bar">hello</div>
```

对应的 vnode 如下：
```js
const vnode = {
  type: 'div',
  props: {
    class: 'foo bar',
  },
  children: 'hello',
}
```

- 对象
```vue
<script setup>
const cls = { foo: true, bar: false }
</script>

<template>
  <div :class="cls">hello</div>
</template>
```

对应的 vnode 如下：
```js
const vnode = {
  type: 'div',
  props: {
    class: { foo: true, bar: false },
  },
  children: 'hello',
}
```

- 包含字符串和对象的数组
```vue
<script setup>
const arr = ['foo', { bar: false }]
</script>

<template>
  <div :class="arr">hello</div>
</template>
```

对应的 vnode 如下：
```js
const vnode = {
  type: 'div',
  props: {
    class: ['foo', { bar: false }],
  },
  children: 'hello',
}
```

为了只会这三种形式，那么我们在设置时就需要做处理，处理非常简单哈，只需要一个序列化函数

```js
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
```

设置 class 有多种方法
- HTML Attributes el.setAttribute('calss')
- DOM Properties：el.className  el.classList

这三种都可以，那么怎么选呢？好吧性能测试，测试结果 el.className 完胜，所以

```js
if(key === 'class') {
  el.className = nextValue || '';
}
```

当然，除了 class， style 同样需要做这样的序列化。

## 8.5 卸载操作

直接 container.innerHTML = null 是不合适的，直接这样卸载无法实现
- 调用卸载时组件的生命周期
- 直接设置，绑定在 dom 上的事件不会移除
- 指令等钩子无法触发

所以，可以通过 vnode 获取真实 dom，通过真实 dom 来卸载

```js
/**
 * 卸载操作
 * @param {*} vnode 
 */
function unmountElement(vnode) {
  // 根据 vnode 获取要卸载的真实 DOM 元素
  const el = vnode.el;
  // 获取真实 DOM 的父元素
  const parent = el.parentNode;
  if(parent) unmount(el, parent)
}
```

这样，因为可以获取到 vnode，所以可以：
- 执行挂载的钩子
- 如果是组件，可以调用组件的声明周期（可以通过 vnode 的类型来判断是否为组件）

## 8.6 vnode 的类型

如果 n1 和 n2 的类型都不相同，就不需要比对了，直接卸载掉 n1，重新挂载 n2，如果相同，那么执行 patch。
当然，不同的类型处理方式不同，所以要根据类型来做处理。

```js
  function patch(n1, n2, container) {
    // 旧节点存在，同时旧节点类型和新结点类型不一致，说明内容不同
    if(n1 && n1.type !== n2.type) {
      unmountElement(n1);
      n1 = null;
    }

    if(!n1) {
      mountElement(n2, container)
    } else {
      // 能走到这里，说明 n1 和 n2 的类型相同，如果不相同， n1 就为 null 了
      // 通过 n2 的类型来决定如何渲染
      const { type } = n2;
      if(typeof type === 'string') {
        // 说明是普通标签元素
          patchElement(n1, n2)
      } else if(isObject(type)) {
        // 如果 n2.type 的值的类型是对象，则描述的是组件
      } else if(type === 'xxx') {
        // 处理其它类型
      }
    }
  }
```

## 8.7 处理事件

事件作为属性的一部分，它具有明确的标识，即我们可以规定以 on 开头的属性，就是事件。

如下 vnode：

```js
const vnode = {
  type: 'div',
  props: {
    onClick: () => {
      alert('你点击了')
    }
  },
  children: 'hello',
}
```

处理起来还是很简单的，用正则匹配只要以 on 开头的，就用 addEventlistern 来添加事件就好了。

仔细看下面绑定的思路哈，太巧妙了。

```js
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
      el.addEventListener(name, invoker);
    } else {
      // 如果已经有，那么更新值即可
      invoker.value = nextValue; 
    } 
  } else if(invoker){
    // 没有，此时应该移除事件
    el.removeEvenetListener(name, invoker)
  }
}
```

## 8.8 事件冒泡与更新时机问题

如下示例：

```js
const toggle = ref(false)

const vnode = {
  type: 'div',
  props: toggle.value ? {
    onClick: [
      () => {
        console.log('点击了 div');
      }
    ]
  } : {},
  children: [
    {
      type: 'button',
      props:  {
        onClick: [
          () => {
            toggle.value = true;
            console.log('点击了 button');
          }
        ]
      },
      children: 'hello'
    }
  ],
}


effect(() => {
  renderer.render(vnode, document.querySelector('#app'));
})
```

从直观来看，当点击了 button 后，父元素上的事件才会绑定，那么在点击 button 时是不会触发 div 上的点击事件的。可因为更新时机的缘故，当 `toggle.value = true;` 时，就会触发 `render` 函数执行，也就是会在 div 上绑定好点击事件，所以点击 button 时，div 上的事件也会被触发。**即事件冒泡晚于了父元素上的事件绑定**。

那么怎么解决呢？第一个想法是让 事件冒泡早于父元素上的事件绑定 就可以了，不过我们是无法捕捉到事件冒泡是否完成的，所以这个办法行不通。

那么有什么办法可以解决呢？

我们来看整个执行顺序哈。

点击事件触发 -> 修改响应式数据 -> 响应式数据修改触发对应的副作用函数执行 -> 父元素绑定点击事件 -> 事件冒泡 -> 触发父元素上的点击事件

从这里会发现一个有意思的点：**父元素绑定点击事件** 的时间是晚于 **事件触发** 的时间的。所以我们可以做一个处理，就是如果事件的绑定时间晚于事件触发时间，那么便不执行对应的事件。

- 事件触发的时间可以记录在 e._vts 上
- 事件绑定的时间可以记录在 invoker 上

当执行事件函数时，比较一下事件触发的时间 和 事件绑定的时间 即可。

```js
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
}
```