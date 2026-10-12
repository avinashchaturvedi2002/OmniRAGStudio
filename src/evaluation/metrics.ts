export function recallAtK(
  retrieved: number[],
  relevant: number[],
  k: number
): number {

  const retrievedTopK = retrieved.slice(0, k);

  const hits = retrievedTopK.filter(
    index => relevant.includes(index)
  );

  return hits.length / relevant.length;
}


export function precisionAtK(
  retrieved: number[],
  relevant: number[],
  k: number
): number {

  const retrievedTopK = retrieved.slice(0, k);

  const hits = retrievedTopK.filter(
    index => relevant.includes(index)
  );

  return hits.length / k;
}

export function reciprocalRank(
  retrieved: number[],
  relevant: number[]
): number {

  for (let i = 0; i < retrieved.length; i++) {
    const result=retrieved[i]
    if(result==undefined)
        throw new Error("Error Occured")
    if (relevant.includes(result)) {
      return 1 / (i + 1);
    }
  }

  return 0;
}


// export function meanReciprocalRank(
//   results: number[][],
//   relevant: number[][]
// ): number {

//   if (results.length === 0) {
//     return 0;
//   }

//   const reciprocalRanks = results.map((retrieved, index) =>
//     reciprocalRank(retrieved, relevant[index] ?? [])
//   );

//   return reciprocalRanks.reduce(
//     (sum, value) => sum + value,
//     0
//   ) / reciprocalRanks.length;
// }