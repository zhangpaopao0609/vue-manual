const loader = () => import('./utils.js');

loader()
  .then((utils) => {
    const { add } = utils;
    const res = add(1, 2);
    console.log(res);
  })