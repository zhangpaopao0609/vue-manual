[toc]

# Vue 也能复用模板了

摘要：妈妈再也不用担心我得在 vue 模板中写冗余的模板了，因为我现在能直接模板复用了。



相信很多使用 Vue 的同学会遇到这样一个问题：

“组件里有几个部分的模板（html 结构）是相同的，要想复用的话，便只能将其抽成一个子组件，但因为要传递属性和监听事件等，总觉得麻烦，这时候就会想，要是能像 React 那样能在组件中直接复用模板就好了。”



譬如下面这个例子：

```vue
<template>
  <dialog v-if="showInDialog">
    <!-- 模板内容 -->
  </dialog>
  <div v-else>
    <!-- 与上相同的模板内容 -->
  </div>
</template>
```

要想复用，就得把这块儿模板抽离成子组件。这很合理，但这样做也会有些不足， **子组件无法访问父组件的上下文，即变量、事件都不能访问到**，需要我们通过属性（props）、事件绑定（v-bind） 的方式来使得子组件得以访问。

子组件的方式是可以，没毛病，**可是当抽离的子组件（可复用部分）仅当前组件多次使用时**，会发现属性传递、事件绑定以及事件触发这一系列过程都没那么优雅了。

> React 这时候笑了，我天然支持好吧

**那有没有办法可以直接在当前组件实现模板的复用呢？**

<img src="./img/复用.png" alt="新建项目 (1)" style="zoom:50%;" />

答案是必须的。

这个问题其实早在 2022 年就已经在 vuejs/core 的 issue 被大家提出并讨论，但一直没有一个好的解决方案，直到 2 天前，超级大神 [antfu](https://github.com/antfu)  提出了一个非常巧妙的方案——“[vue-reuse-template](https://github.com/antfu/vue-reuse-template)”，这也是今天的主题。

[vue-reuse-template](https://github.com/antfu/vue-reuse-template) 用一个很优雅巧妙的思想解决了模板复用的问题，一起来看看大神之作吧。



## 1. 怎么用

1. 基本使用

   用法非常的简单，一个定义，一个使用，就像使用变量一样简单。

   ```vue
   <script setup>
   import { createReusableTemplate } from 'vue-reuse-template'
   
   const [DefineTemplate, ReuseTemplate] = createReusableTemplate()
   </script>
   
   <template>
     <DefineTemplate>
       <!-- something complex -->
     </DefineTemplate>
   
     <dialog v-if="showInDialog">
       <ReuseTemplate />
     </dialog>
     <div v-else>
       <ReuseTemplate />
     </div>
   </template>
   ```

   - `DefineTemplate` 内部包裹需要复用的模板，`DefineTemplate` 不会渲染内容，这就相当于变量的定义阶段。

   - `ReuseTemplate` 与 `DefineTemplate` 成对出现，`ReuseTemplate`会渲染出模板内容，这就相当于变量的使用阶段。

   

2. 传递参数

   ```vue
   <template>
     <DefineTemplate v-slot="{ data, msg, anything }">
       <div>{{ data }} passed from usage</div>
     </DefineTemplate>
   
     <ReuseTemplate :data="data" msg="The first usage" />
     <ReuseTemplate :data="anotherData" msg="The second usage" />
     <ReuseTemplate v-bind="{ data: something, msg: 'The third' }" />
   </template>
   ```

欲知更多用法，[传送门在此](https://github.com/antfu/vue-reuse-template)。



## 2. 怎么实现的

“哇塞，这有点意思呀，它是怎么实现的呀！不会很复杂吧！”，这是我看到后的第一想法。

实现方式非常的巧妙，包含类型，整个代码也就 75 行，主函数也就 30 行左右，这么简单吗？一起来看看它是如何实现的吧！

先总结：

1. 利用 **插槽** 获取 “待复用模板” —— `define`
2. 利用 **闭包** 所记录的插槽实现复用 —— `reuse`

```ts
export function createReusableTemplate<
  Bindings extends object,
  Slots extends Record<string, Slot | undefined> = Record<string, Slot | undefined>,
>(name?: string) {
  // render 用于记录 “待复用模板”
  let render: Slot | undefined
	
  // 定义组件：组件作为 “待复用模板” 外层，此时，插槽的内容，即 “待复用模板” 用 render 记录下来
  const define = defineComponent((_, { slots }) => {
    return () => {
      // 这里没有 return 任何内容，所以不会渲染
      render = slots.default
    }
  })
	
  // 复用组件：直接渲染 render 以达到复用的效果
  const reuse = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => {
        return render?.({ ...attrs, $slots: slots })
      }
    },
  })
	
  // 导出 定义组件 和 复用组件
  return makeDestructurable(
    { define, reuse },
    [define, reuse] as const,
  )
}
```

这里来详细说明：

1. `render` 变量

   `render` 用于记录 “待复用模板”

2. `define` 函数（组件）

   通过 `defineComponent` 函数直接生成组件，可以将其理解为它就是一个子组件（自定义组件），将 “待复用模板” 作为其插槽，组件渲染时，会执行里面的 `render = slots.default`，如此，“待复用模板”  便被记录了下来。

   > 相当于说 “待复用模板” 作为了插槽给记录了下来

   而且，`define` 函数没有 return 任何内容，所以不会渲染。

3. `reuse` 函数（组件）

   同样通过 `defineComponent` 函数直接生成组件，内部渲染的是什么呢？就是 `define` 函数中所记录的 `render`，如此，便实现了复用。

   > 这里就是闭包

4. 参数传递

   `render` 所记录的就是一个插槽，所以参数的传递与插槽完全一致。

5. 作用域（上下文）

   插槽所在的作用域就是父组件的作用域，所以，“待复用模板”可直接使用组件的变量、事件等。

   > 哇，这多香呀

整个思路没有一个是超纲知识，**如此简单却如此优雅**，所以大神还是大神呀！哈哈！



## 3. 注意事项

1. 不要滥用

   很好用，但请不要滥用它。

   如果一个复用的部分仅在当前组件使用并且在能保证维护性的前提下，使用它很香。除此之外，不论是从复用的角度还是项目维护成本的角度去看，该抽离成子组件的时候建议还是抽离。

   

2. 性能不用担心

   从实现的就可以看出，复用的过程开销很小，基本不需要担心它对性能的影响。

## 4. 未来发展

因为场景确实会遇到，而且并不算罕见；加之社区很多同学都在反应。

![image-20230414205729888](/Users/ardor/Desktop/vue模板复用/img/github.png)

所以未来官方有可能会直接支持的。