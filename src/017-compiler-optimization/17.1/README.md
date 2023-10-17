# 17 编译优化
编译优化指的是在编译时（将模板编译成渲染函数）尽可能多地提取关键信息，并以此指导生成最优代码的过程。

既然是要提供关键信息，那这些信息就是要有助于运行时（渲染器）。

虽然不同框架编译优化策略不同，但优化的基本方向都是：尽可能地区分动态和静态内容，并针对不同的内容采用不同的优化策略。

既然编译优化是为运行时提供优化的，那么编译优化就要强依赖与渲染器。
我这句话好像是废话耶，因为编译的结果就是给渲染器用的，本来两个就是强依赖的。

## 17.1 动态节点收集与补丁收集

### 17.1.1 传统 diff 算法的问题

```html
<div id="foo">
  <p class="bar">{{ text }}</p>
</div>
```

如上述模板，在 09,10,11 三节中讲述的 diff 算法均需要一层层地比对才能完成更新。
- 比对 div 和它的属性
- 比对 p 和它的属性
- 比较 text 是否发生变化，如果变化了，更新，如果没有，则无反应。

其实可以看到，模板中仅仅有 text 是动态的，其它全是静态的，如果能够知道这个信息，那么 patch 的时候将会减少很多的开销。但可惜的是，目前的 diff 均无法得知这个信息。

那么 **传统 Diff 算法无法避免新旧虚拟 DOM 树间无用的比较操作**。

## 17.1.2 Block 与 PatchFlags
之所以传统 diff 算法无法避免新旧虚拟 DOM 树之间无用的比较操作，是因为 diff 算法在运行时得不到足够的信息，运行时无法知道哪些是静态的，哪些是动态的，所以自然 diff 算法就只能一层一层地进行比较了。

但如果在渲染时知道这些信息呢？那是不是就可以了呢？

我们来看看：
```html
<div>
  <div>foo</div>
  <p>{{ bar }}</p>
</div>
```

可以看到，只有 `{{ bar }}` 是动态的，因此，我们可以给它打一个 patchFlag：

```js
const vnode = {
  type: 'div',
  children: [
    { type: 'div', children: 'foo' },
    { type: 'p', children: ctx.bar, patchFlag: 1 }, // 这是动态节点
  ]
}
```

这个 patchFlag 有两个作用
- 标明这个节点是一个动态节点，没有这个标识的，说明是一个纯静态节点
- 通过 二进制 来标明节点上具体哪一个是动态的
  数字1：代表节点上有动态的 textContent
  数字2：代表元素有动态的 class
  数字4：代表有动态的 style 绑定
  ...
  > 这样，假设 patchFlag 为 5，说明节点上仅有文本和 style 是动态的，其它的属性都不需要检查了，这样就可以做到**靶向更新**了。

这样，我们可以在 vnode 创建阶段（也就是 render 函数执行的时候），把 vnode 的动态子节点提取出来了，并且将其存储在 vnode 的 dynamicChildren 数组内：

```js
const vnode = {
  type: 'div',
  children: [
    { type: 'div', children: 'foo' },
    { type: 'p', children: ctx.bar, patchFlag: PatchFlags.Text }, // 这是动态节点
  ],
  // 将 children 中的动态节点提取到 dynamicChildren 数组中
  dynamicChildren: [
    // p 标签具有 patchFlag 属性，因此它是动态节点
    { type: 'p', children: ctx.bar, patchFlag: PatchFlags.Text }, 
  ]
}
```

将带有 dynamicChildren 属性的 vnode 称为 ”块“，即 Block。一个 Block 不仅能够收集直接子节点，还能收集所有的动态子节点。因为有了 Block，所以渲染器的更新操作就将以 Block 为维度。也就是说，在更新时，渲染器不再以 vnode 的 children 了，而是使用 vnode 的 dynamicChildren，这样可以避免很多无谓的的比较，因为这样实现了跳过静态内容，仅更新动态内容。同时因为动态节点都有 PatchFlag 标识，所以更新的时候可以做到靶向更新。

那么哪些节点上要挂载 dynamicChildren 呢？换句话说，哪一层级作为 Block 呢？
- 所有的根节点
- 带有 v-for、v-if/v-else-if/v-else 的节点

这种均需要作为一个 Block。