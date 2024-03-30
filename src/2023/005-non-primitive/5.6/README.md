# 5.6 只读和只浅读

比如，向组件传递的 props 就应该是一个只读的数据

考虑几个点

1. 只读，那么当用户在修改这个值的时候，就应当抛出一个警告（包括设置和删除）
2. 既然无法修改了，那么收集也就失去了意义了，当发现数据是只读数据时，就不需要收集了

