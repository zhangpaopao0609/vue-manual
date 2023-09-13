import { effect, ref } from "../reactivity.js";

function renderer(domString, container) {
  container.innerHTML = domString;
}

const count = ref(1)

effect(() => {
  renderer(`<h1>${count.value}</h1>`, document.body)
});

setTimeout(() => {
  count.value = 2;
}, 1000);