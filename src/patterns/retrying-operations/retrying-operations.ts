const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const maybeFail = (successProbability: number, result: any, error: any) => {
  return new Promise((resolve, reject) => {
    if (Math.random() < successProbability) {
      resolve(result);
    } else {
      reject(error);
    }
  });
};

const maybeFailingOperation = async () => {
  await wait(300);
  return maybeFail(0.4, "result", "error");
};

const callWithRetries = async (fn: () => Promise<any>, retries: number) => {
  try {
    console.log("try the operation");
    return await fn();
  } catch (error) {
    console.log("error occurred");
    if (retries <= 0) {
      throw error;
    }
    await wait(1000);
    return await callWithRetries(fn, retries - 1);
  }
};

const result = await callWithRetries(maybeFailingOperation, 10);
console.log(result);
