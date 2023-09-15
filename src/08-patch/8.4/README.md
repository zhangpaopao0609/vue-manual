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

当然，除了 class， style 同样需要做这样的序列化