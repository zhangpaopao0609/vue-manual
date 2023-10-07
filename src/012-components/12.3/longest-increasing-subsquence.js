// 最长递增子序列

// 给你一个整数数组 nums ，找到其中最长严格递增子序列的长度。

// 子序列 是由数组派生而来的序列，删除（或不删除）数组中的元素而不改变其余元素的顺序。例如，[3,6,2,7] 是数组 [0,3,1,6,2,2,7] 的子序列。


// 示例 1：
// 输入：nums = [10,9,2,5,3,7,101,18]
// 输出：4
// 解释：最长递增子序列是 [2,3,7,101]，因此长度为 4 。

// 示例 2：
// 输入：nums = [0,1,0,3,2,3]
// 输出：4

// 示例 3：
// 输入：nums = [7,7,7,7,7,7,7]
// 输出：1

// dp[i] 以 nums[i] 为结尾的最长递增子序列
function lengthOfLIS_v1(nums) {
  const len = nums.length;
  const dp = new Array(len).fill(1);
  let res = 1;

  for (let i = 1; i < len; i++) {
    let max = 0;
    const n = nums[i];
    for (let j = 0; j < i; j++) {
      if (n > nums[j]) {
        max = Math.max(max, dp[j])
      }
    }
    dp[i] = max + 1;
    res = Math.max(res, dp[i])
  }

  return res
};

function lengthOfLIS_v2(nums) {
  const n = nums.length;
  if (n === 0) return 0;

  const dp = new Array(n).fill(0);
  let len = 1;
  dp[len] = nums[0];

  for (let i = 1; i < n; i++) {
    const n = nums[i];
    if (n > dp[len]) {
      dp[++len] = n;
    } else {
      let l = 1;
      let r = len;
      let pos = 0;
      while (l <= r) {
        const mid = (r + l) >> 1;
        if (dp[mid] < n) {
          l = mid + 1;
          pos = mid;
        } else {
          r = mid - 1;
        }
      }
      dp[pos + 1] = n;
    }
  }
  return len
};

function getSequence(arr) {
  const p = arr.slice()
  const result = [0]
  let i, j, u, v, c
  const len = arr.length
  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1
      while (u < v) {
        c = (u + v) >> 1
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}

export default getSequence;
