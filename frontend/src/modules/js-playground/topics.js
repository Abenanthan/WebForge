/**
 * JavaScript Playground curriculum. Every example is real, runnable code;
 * `focus` tells the learner what to watch in the execution timeline.
 * `experiment` matches a slug in the experiments catalogue (database/seed.sql).
 */
export const TOPICS = [
  {
    id: 'variables',
    title: 'Variables',
    experiment: 'js-variables',
    summary: 'let, const and how values change over time.',
    examples: [
      {
        title: 'let vs const',
        focus: 'Each assignment appears in the timeline with the new value. Try reassigning `pi`.',
        code: `let score = 10;
const pi = 3.14;
score = score + 5;
score += 2;
console.log('score is', score, 'and pi is', pi);
`,
      },
      {
        title: 'Block scope',
        focus: 'The inner `message` is a different variable. Compare the two log lines.',
        code: `let message = 'outer';
{
  let message = 'inner';
  console.log('inside the block:', message);
}
console.log('outside the block:', message);
`,
      },
    ],
  },
  {
    id: 'data-types',
    title: 'Data types',
    experiment: 'js-data-types',
    summary: 'Primitives, objects and typeof.',
    examples: [
      {
        title: 'typeof every type',
        focus: 'Notice typeof null is "object", a historical quirk.',
        code: `const values = [42, 'text', true, undefined, null, { a: 1 }, [1, 2], () => 1, 10n];
for (const value of values) {
  console.log(typeof value, value);
}
`,
      },
      {
        title: 'Primitive vs reference',
        focus: 'Copying an object copies the reference: both names see the change.',
        code: `let a = 5;
let b = a;
b = 6;
const original = { count: 1 };
const copy = original;
copy.count = 99;
console.log('a =', a, 'b =', b);
console.log('original.count =', original.count);
`,
      },
    ],
  },
  {
    id: 'operators',
    title: 'Operators',
    experiment: 'js-operators',
    summary: 'Arithmetic, comparison, logical operators and coercion.',
    examples: [
      {
        title: '== vs ===',
        focus: '== converts types before comparing; === does not.',
        code: `const results = {
  looseNumberString: 0 == '0',
  strictNumberString: 0 === '0',
  looseNullUndefined: null == undefined,
  strictNullUndefined: null === undefined,
  nanEqualsItself: NaN === NaN,
};
console.log(results);
`,
      },
      {
        title: 'Arithmetic & precedence',
        focus: 'String + number concatenates; *, / and % happen before + and -.',
        code: `const total = 2 + 3 * 4;
const grouped = (2 + 3) * 4;
const remainder = 17 % 5;
const mixed = '5' + 3;
const coerced = '5' * 3;
console.log(total, grouped, remainder, mixed, coerced);
`,
      },
    ],
  },
  {
    id: 'conditions',
    title: 'Conditions',
    experiment: 'js-conditions',
    summary: 'if / else, the ternary operator and truthiness.',
    examples: [
      {
        title: 'Grading with if / else',
        focus: 'Each condition shows true or false; execution stops at the first true branch.',
        code: `const marks = 72;
let grade;
if (marks >= 90) {
  grade = 'A';
} else if (marks >= 75) {
  grade = 'B';
} else if (marks >= 60) {
  grade = 'C';
} else {
  grade = 'F';
}
console.log('marks', marks, '→ grade', grade);
`,
      },
      {
        title: 'Truthy and falsy',
        focus: '0, "", null, undefined and NaN are falsy; everything else is truthy.',
        code: `const inputs = [0, '', 'hello', null, [], {}];
for (const value of inputs) {
  const kind = value ? 'truthy' : 'falsy';
  console.log(JSON.stringify(value), 'is', kind);
}
`,
      },
    ],
  },
  {
    id: 'loops',
    title: 'Loops',
    experiment: 'js-loops',
    summary: 'for, while, for...of and loop control.',
    examples: [
      {
        title: 'Summing with for',
        focus: 'Watch the condition checked before every iteration, including the final false.',
        code: `let sum = 0;
for (let i = 1; i <= 4; i++) {
  sum += i;
}
console.log('1 + 2 + 3 + 4 =', sum);
`,
      },
      {
        title: 'while with break',
        focus: 'The loop ends early when break runs, before the condition becomes false.',
        code: `let n = 1;
let steps = 0;
while (n < 1000) {
  n = n * 3;
  steps++;
  if (n > 50) {
    break;
  }
}
console.log('stopped at', n, 'after', steps, 'steps');
`,
      },
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    experiment: 'js-functions',
    summary: 'Declarations, arrows, parameters, return values and closures.',
    examples: [
      {
        title: 'Calls and returns',
        focus: 'Every call shows its arguments; every return shows the value handed back.',
        code: `function area(width, height) {
  return width * height;
}
const square = (side) => area(side, side);
const result = square(4) + area(2, 3);
console.log('total area:', result);
`,
      },
      {
        title: 'Closures',
        focus: 'Each counter remembers its own `count` between calls.',
        code: `function makeCounter() {
  let count = 0;
  return function increment() {
    count++;
    return count;
  };
}
const a = makeCounter();
const b = makeCounter();
a();
a();
console.log('a:', a(), 'b:', b());
`,
      },
    ],
  },
  {
    id: 'objects',
    title: 'Objects',
    experiment: 'js-objects',
    summary: 'Properties, methods, destructuring and spread.',
    examples: [
      {
        title: 'Properties and methods',
        focus: 'Expand the logged object to explore its properties.',
        code: `const student = {
  name: 'Asha',
  marks: [78, 91, 66],
  average() {
    const total = this.marks.reduce((sum, m) => sum + m, 0);
    return total / this.marks.length;
  },
};
student.department = 'CSE';
console.log(student.name, 'averages', student.average().toFixed(1));
console.log(student);
`,
      },
      {
        title: 'Destructuring & spread',
        focus: 'Destructuring pulls values out; spread copies them into a new object.',
        code: `const settings = { theme: 'dark', fontSize: 14, autosave: true };
const { theme, fontSize } = settings;
const updated = { ...settings, fontSize: 16 };
console.log(theme, fontSize);
console.log('original', settings.fontSize, '→ updated', updated.fontSize);
`,
      },
    ],
  },
  {
    id: 'arrays',
    title: 'Arrays',
    experiment: 'js-arrays',
    summary: 'Indexing, push/pop and map / filter / reduce.',
    examples: [
      {
        title: 'map, filter, reduce',
        focus: 'Each callback call appears in the timeline with its argument and result.',
        code: `const prices = [120, 45, 300, 80];
const withTax = prices.map((p) => p * 1.18);
const expensive = withTax.filter((p) => p > 100);
const total = expensive.reduce((sum, p) => sum + p, 0);
console.log('expensive items:', expensive.length, 'total:', total.toFixed(2));
`,
      },
      {
        title: 'Mutating methods',
        focus: 'push and pop change the array in place: the same array, new contents.',
        code: `const stack = [];
stack.push('html');
stack.push('css');
stack.push('js');
const last = stack.pop();
console.log('popped', last, 'remaining', stack, 'length', stack.length);
`,
      },
    ],
  },
];

export function findTopic(id) {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[0];
}
