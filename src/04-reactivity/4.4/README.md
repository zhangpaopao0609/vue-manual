4.4 分支切换
避免浪费

比如
```js
const data = { ok: true, text: '这是 a 的内容' };
const p = reactive(data);

effect(() => {
  const a = document.getElementById('a')
  a.innerHTML = p.ok ? p.text : 'data 的 a 变成了 false 了'
})
```