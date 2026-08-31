let counter = 0;

const serialize = (fn: (...args: any[]) => any) => {
  let queue = Promise.resolve();

  return (...args: any[]) => {
    const result = queue.then(() => fn(...args));
    queue = result.catch(() => {});
    return result;
  };
};

const fn = serialize(
  (() => {
    const cacheTime = 2000;
    let lastRefreshed: number = 0;
    let lastResult: unknown = undefined;
    return async () => {
      const currentTime = new Date().getTime();
      // check if cache is fresh enough
      if (lastResult === undefined || lastRefreshed + cacheTime < currentTime) {
        // refresh the value
        lastResult = await refresh();
        lastRefreshed = currentTime;
      }
      return lastResult;
    };
  })(),
);

// example to try it
console.log(await fn());
console.log(await fn());
await wait();
await wait();
console.log(await fn());
await wait();
console.log(await fn());

async function refresh() {
  counter++;
  console.log(`refreshing (${counter})`);
  return counter;
}

function wait() {
  return new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
}
