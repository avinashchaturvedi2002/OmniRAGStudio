export interface EvaluationQuery {
  query: string;
  relevantChunkIndices: number[];
}

export const evaluationQueries: EvaluationQuery[] = [

  {
    query: "How does virtual memory work?",
    relevantChunkIndices: [4, 5, 3]
  },

  {
    query: "What is a process?",
    relevantChunkIndices: [1, 2]
  },

  {
    query: "How does paging work?",
    relevantChunkIndices: [5, 4]
  },

  {
    query: "What does a file system do?",
    relevantChunkIndices: [6, 7]
  },

  {
    query: "What does an operating system do?",
    relevantChunkIndices: [0]
  },

  {
    query: "What is virtual memory?",
    relevantChunkIndices: [4]
  },

  {
    query: "Why is virtual memory needed?",
    relevantChunkIndices: [4]
  },

  {
    query: "What is the difference between virtual memory and physical memory?",
    relevantChunkIndices: [4]
  },

  {
    query: "What is a page in operating systems?",
    relevantChunkIndices: [5]
  },

  {
    query: "What is a page table?",
    relevantChunkIndices: []
  },

  {
    query: "Why does an operating system use paging?",
    relevantChunkIndices: [5, 4]
  },

  {
    query: "What happens when a process is created?",
    relevantChunkIndices: [1, 2]
  },

  {
    query: "How are processes managed by an operating system?",
    relevantChunkIndices: [1, 2]
  },

  {
    query: "What is the difference between a process and a program?",
    relevantChunkIndices: [1]
  },

  {
    query: "What information does the operating system maintain about a process?",
    relevantChunkIndices: []
  },

  {
    query: "How does the file system organize data?",
    relevantChunkIndices: [6]
  },

  {
    query: "How are files stored and managed?",
    relevantChunkIndices: [6, 7]
  },

  {
    query: "Why do operating systems need a file system?",
    relevantChunkIndices: [6]
  },

  {
    query: "What are the main functions of an operating system?",
    relevantChunkIndices: [0]
  },

  {
    query: "How does an operating system manage computer resources?",
    relevantChunkIndices: [0]
  },

  {
    query: "What role does an operating system play between hardware and applications?",
    relevantChunkIndices: [0]
  },

  {
    query: "How does the OS manage memory?",
    relevantChunkIndices: [3, 4, 5]
  },

  {
    query: "How does the OS manage processes?",
    relevantChunkIndices: [1, 2]
  },

  {
    query: "How does the OS manage files?",
    relevantChunkIndices: [6, 7]
  },

  {
    query: "What is the relationship between paging and virtual memory?",
    relevantChunkIndices: [4, 5]
  },

  {
    query: "How does the operating system manage hardware?",
    relevantChunkIndices: [0]
  },

  {
    query: "How are processes and memory related?",
    relevantChunkIndices: [1, 3]
  },

  {
    query: "How does the operating system store files?",
    relevantChunkIndices: [6, 7]
  },

  {
    query: "How does the operating system manage network connections?",
    relevantChunkIndices: []
  },

  {
    query: "How do I bake a chocolate cake?",
    relevantChunkIndices: []
  }

];