function param(num) {
  console.log(num);
  return num;
}

function doIt(num) {
  console.log('doIt');
  return num
}

doIt(param(1))