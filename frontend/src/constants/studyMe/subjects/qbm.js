const latex = String.raw

export const QBM_SUBJECT = {
  id: 'qbm',
  title: 'Quantitative Business Methods',
  description: 'Numerical-first StudyMe roadmap focused on formulas, worked examples, and practice sets.',
  contentType: 'hybrid',
  lessons: [
    {
      id: 'qbm-01',
      lessonNumber: 1,
      title: 'Introduction to Managerial Decision Modeling',
      covers: 'Conceptual foundations of decision modeling, deterministic vs. probabilistic types, and the initial formulation of Linear Programming models.',
      tags: ['decision-modeling', 'formulation', 'fundamentals'],
      pdfPath: '/pdfs/qbm/qbm1.pdf',
      formulaSections: [
        {
          title: 'LP General Structure',
          description: 'The standard framework for optimization problems.',
          formulas: [
            {
              name: 'Objective Function',
              formula: 'Max/Min Z = c1x1 + c2x2',
              latex: 'Z_{max/min} = c_1x_1 + c_2x_2',
              notation: {
                Z: 'Measure of performance ',
                'c1, c2': 'Profit/Cost coefficients ',
                'x1, x2': 'Decision variables'
              },
            },
          ],
        },
      ],
      numericals: [
        // --- LEARN SECTION: Detailed Walkthroughs ---
        {
          id: 'qbm-01-se-01',
          topicId: 'qbm-01-t1',
          type: 'solved-example',
          title: 'Shirt Stocking Profit Maximization',
          pageReference: 'Page 26',
          question: 'A retail store stocks two types of shirts A and B. During a week the store can sell a maximum of 400 shirts of type A and a maximum of 300 shirts of type B. The storage capacity, however, is limited to a maximum of 600 of both types combined. Type A shirt fetches a profit of Rs. 2/- per unit and type B a profit of Rs. 5/- per unit. How many of each type the store should stock per week to maximize the total profit? Formulate a mathematical model.',
          asksFor: 'LPP Formulation for Profit Maximization.',
          identifiedValues: ['Profit A: Rs 2, B: Rs 5', 'Sell Max: A=400, B=300', 'Capacity: 600'],
          formulaRef: 'Linear Programming Formulation',
          formulaReason: 'Maximizing a linear objective under multiple resource/sales limits.',
          substitution: latex`Maximize \ Z = 2x_1 + 5x_2`,
          elaborativeSteps: `
    Step 1: Define Decision Variables
    Let,
    x1 = number of shirts of type A to be stocked
    x2 = number of shirts of type B to be stocked

    Step 2: Form Objective Function
    Profit per unit is Rs. 2 for A and Rs. 5 for B.
    Maximize Z = 2x1 + 5x2

    Step 3: Form Constraints
    Sales Limits:
    x1 ≤ 400 (Type A sales limit)
    x2 ≤ 300 (Type B sales limit)
    Storage Capacity:
    Combined total cannot exceed 600.
    x1 + x2 ≤ 600

    Step 4: Non-Negativity Condition
    x1, x2 ≥ 0
          `,
          finalAnswer: 'Maximize Z = 2x1 + 5x2; Subject to: x1 ≤ 400, x2 ≤ 300, x1 + x2 ≤ 600, x1, x2 ≥ 0.'
        },
        {
          id: 'qbm-01-se-02',
          topicId: 'qbm-01-t1',
          type: 'solved-example',
          title: 'Vitamin Deficiency Tonic Minimization',
          pageReference: 'Page 27',
          question: 'A patient is advised by a doctor to consume at least 40 units of Vitamin A and 50 units of Vitamin D daily. The patient can buy Tonic X and Tonic Y. The costs and vitamin proportions are given in the table below. Formulate LPP to minimize the cost of tonics.',
          questionTable: `
    ┌─────────────────┬─────────┬─────────┬──────────────────┐
    │    Vitamins     │ Tonic X │ Tonic Y │ Min. Requirement │
    ├─────────────────┼─────────┼─────────┼──────────────────┤
    │    Vitamin A    │    2    │    4    │        40        │
    │    Vitamin D    │    3    │    2    │        50        │
    ├─────────────────┼─────────┼─────────┼──────────────────┤
    │ Cost in Rs/unit │    5    │    3    │                  │
    └─────────────────┴─────────┴─────────┴──────────────────┘`,
          asksFor: 'Minimization LPP formulation.',
          identifiedValues: ['Cost: X=5, Y=3', 'Min Vit A: 40, Min Vit D: 50'],
          formulaRef: 'Minimization Model',
          formulaReason: 'Costs are minimized while meeting "at least" thresholds.',
          substitution: latex`Minimize \ Z = 5x_1 + 3x_2`,
          elaborativeSteps: `
    Step 1: Define Decision Variables
    Let,
    x1 = units of Tonic X consumed
    x2 = units of Tonic Y consumed

    Step 2: Form Objective Function
    Minimize Z = 5x1 + 3x2

    Step 3: Form Constraints
    Vitamin A:
    2x1 + 4x2 ≥ 40
    Vitamin D:
    3x1 + 2x2 ≥ 50

    Step 4: Non-Negativity Condition
    x1, x2 ≥ 0
          `,
          finalAnswer: 'Minimize Z = 5x1 + 3x2; Subject to: 2x1 + 4x2 ≥ 40, 3x1 + 2x2 ≥ 50, x1, x2 ≥ 0.'
        },
        {
          id: 'qbm-01-se-03',
          topicId: 'qbm-01-t1',
          type: 'solved-example',
          title: 'Three-Machine Production Mix',
          pageReference: 'Page 32',
          question: 'A company manufactures two products, X and Y by using three machines A, B, and C. Available capacity for next week: Machine A = 4 hrs, B = 24 hrs, C = 35 hrs. Product X requires 1 hr of A, 3 hrs of B, and 10 hrs of C. Product Y requires 1 hr of A, 8 hrs of B, and 7 hrs of C. Profit per unit: X = Rs 5, Y = Rs 7. Formulate the problem.',
          asksFor: 'Production mix LPP formulation.',
          identifiedValues: ['Profit: X=5, Y=7', 'Caps: A=4, B=24, C=35'],
          formulaRef: 'Product Mix Model',
          formulaReason: 'Optimizing product mix against multiple machine bottlenecks.',
          substitution: latex`Maximize \ Z = 5x_1 + 7x_2`,
          elaborativeSteps: `
    Step 1: Define Decision Variables
    Let,
    x1 = units of product X
    x2 = units of product Y

    Step 2: Form Objective Function
    Maximize Z = 5x1 + 7x2

    Step 3: Form Constraints
    Machine A: x1 + x2 ≤ 4
    Machine B: 3x1 + 8x2 ≤ 24
    Machine C: 10x1 + 7x2 ≤ 35

    Step 4: Non-Negativity Condition
    x1, x2 ≥ 0
          `,
          finalAnswer: 'Maximize Z = 5x1 + 7x2; S.t. x1+x2≤4, 3x1+8x2≤24, 10x1+7x2≤35, x1,x2≥0.'
        },

        // --- PRACTICE SECTION ---
        {
          id: 'qbm-01-pq-01',
          topicId: 'qbm-01-t2',
          type: 'practice-question',
          title: 'Four-Facility Model',
          pageReference: 'Page 31',
          question: 'A company manufactures products X and Y. Profit contributions: X=Rs 3, Y=Rs 4. Facilities A, B, C, D have capacities of 200, 150, 100, and 80 hours. X needs (5, 3, 5, 8) hours respectively. Y needs (4, 5, 5, 4) hours respectively. Formulate.',
          elaborativeSteps: `
            Step 1: Let x1 = units of X, x2 = units of Y.
            Step 2: Maximize Z = 3x1 + 4x2
            Step 3: Constraints
            A: 5x1 + 4x2 ≤ 200
            B: 3x1 + 5x2 ≤ 150
            C: 5x1 + 5x2 ≤ 100
            D: 8x1 + 4x2 ≤ 80
            Step 4: x1, x2 ≥ 0
          `,
          finalAnswer: 'Max Z = 3x1 + 4x2; Subject to: 5x1+4x2≤200, 3x1+5x2≤150, 5x1+5x2≤100, 8x1+4x2≤80, x1,x2≥0.'
        },//
        {
          id: 'qbm-01-pq-02',
          topicId: 'qbm-01-t2',
          type: 'practice-question',
          title: 'Reddy Mikks Paint Mix (Example 7)',
          questionType: 'Formulation',
          difficulty: 'hard',
          question: 'Reddy Mikks produces both interior and exterior paints from two raw materials, M1 and M2. A market survey indicates that the daily demand for interior paint cannot exceed that for the exterior paint by more than 1 ton. Also, the maximum daily demand for interior paint is 2 tons. Determine the optimum product mix to maximize total daily profit.',
          questionTable: `
            ┌──────────────────────────┬──────────────────────┬──────────────────────┬────────────────────────────┐
            │                          │ Tons of raw material │ per ton of           │ Maximum daily              │
            ├──────────────────────────┼──────────────────────┼──────────────────────┼────────────────────────────┤
            │                          │ Exterior paint       │ Interior paint       │ availability (tons)        │
            ├──────────────────────────┼──────────────────────┼──────────────────────┼────────────────────────────┤
            │ Raw material, M1         │ 6                    │ 4                    │ 24                         │
            │ Raw material, M2         │ 1                    │ 2                    │ 6                          │
            ├──────────────────────────┼──────────────────────┼──────────────────────┼────────────────────────────┤
            │ Profit per ton ($1000)   │ 5                    │ 4                    │                            │
            └──────────────────────────┴──────────────────────┴──────────────────────┴────────────────────────────┘`,
          hint: 'The demand constraint "cannot exceed exterior by more than 1 ton" is written as: (Interior - Exterior) <= 1. ',
          steps: [
            'Variables: x1 = tons of exterior paint, x2 = tons of interior paint. ',
            'Objective: Maximize Z = 5x1 + 4x2 (in $1000s). ',
            'M1 Constraint: 6x1 + 4x2 <= 24. ',
            'M2 Constraint: 1x1 + 2x2 <= 6. ',
            'Demand Limit 1: x2 - x1 <= 1. ',
            'Demand Limit 2: x2 <= 2. ',
            'Non-negativity: x1, x2 >= 0. '
          ],
          finalAnswer: 'Max Z = 5x1 + 4x2; s.t. 6x1+4x2<=24, x1+2x2<=6, x2-x1<=1, x2<=2, x1,x2>=0. '
        },
        {
          id: 'qbm-01-pq-03',
          topicId: 'qbm-01-t2',
          type: 'practice-question',
          title: 'Frontier Bakery Biscuit Mix (Example 8)',
          questionType: 'Formulation',
          difficulty: 'hard',
          question: 'Frontier Bakery needs to supply 1,000 kg of high protein biscuits made from 4 ingredients: R, S, T, and U. The batch must contain minimum levels of protein, fat, carbohydrate, and sugar. Only 150kg of S and 200kg of T are immediately available. Draft a suitable LP Model. [cite: 176]',
          questionTable: `
            ┌─────────────┬──────────┬──────────┬──────────────┬──────────┬──────────┬─────────────────┐
            │ Ingredients │ Protein  │   Fat    │ Carbohydrate │  Sugar   │  Filler  │  Cost (Rs/kg)   │
            ├─────────────┼──────────┼──────────┼──────────────┼──────────┼──────────┼─────────────────┤
            │      R      │   50%    │   30%    │     15%      │    5%    │    0%    │       16        │
            │      S      │   10%    │   15%    │     50%      │   15%    │   10%    │        4        │
            │      T      │   30%    │    5%    │     30%      │   30%    │    5%    │        6        │
            │      U      │    0%    │    5%    │      5%      │   30%    │   60%    │        2        │
            └─────────────┴──────────┴──────────┴──────────────┴──────────┴──────────┴─────────────────┘
    Min Requirements: Protein (400kg), Fat (250kg), Carbohydrate (300kg), Sugar (50kg). [cite: 176]`,
          hint: 'Convert percentages to decimals (e.g., 50% = 0.5) for the constraints. [cite: 176]',
          steps: [
            'Variables: x1, x2, x3, x4 = kg of R, S, T, U used. [cite: 176]',
            'Objective: Minimize Cost Z = 16x1 + 4x2 + 6x3 + 2x4. [cite: 176]',
            'Batch Total: x1 + x2 + x3 + x4 = 1,000. [cite: 176]',
            'Protein: 0.5x1 + 0.1x2 + 0.3x3 >= 400. [cite: 176]',
            'Fat: 0.3x1 + 0.15x2 + 0.05x3 + 0.05x4 >= 250. [cite: 176]',
            'Availability: x2 <= 150, x3 <= 200. [cite: 176]'
          ],
          finalAnswer: 'Min Z = 16x1+4x2+6x3+2x4; s.t. x1+x2+x3+x4=1000, Protein/Fat/Carb/Sugar >= mins, x2<=150, x3<=200. [cite: 176]'
        },
        {
          id: 'qbm-01-pq-04',
          topicId: 'qbm-01-t2',
          type: 'practice-question',
          title: 'City Bus Scheduling (Example 2.3)',
          questionType: 'Formulation',
          difficulty: 'hard',
          question: 'A city bus system must meet minimum driver requirements for six 4-hour shifts. Drivers work 8 consecutive hours (two shifts). Formulate to minimize the total number of drivers. [cite: 34]',
          questionTable: `
    ┌───────┬───────────────────────┬──────────────────────────┐
    │ Shift │ Time Period           │ Min Drivers Required     │
    ├───────┼───────────────────────┼──────────────────────────┤
    │   1   │ 6 AM - 10 AM          │           60             │
    │   2   │ 10 AM - 2 PM          │           70             │
    │   3   │ 2 PM - 6 PM           │           60             │
    │   4   │ 6 PM - 10 PM          │           50             │
    │   5   │ 10 PM - 2 AM          │           20             │
    │   6   │ 2 AM - 6 AM           │           30             │
    └───────┴───────────────────────┴──────────────────────────┘`,
          hint: 'Let xi be the number of drivers starting at the beginning of shift i. They cover shift i and i+1. [cite: 34]',
          steps: [
            'Variables: x1 to x6 (drivers starting at shift 1 through 6). [cite: 34]',
            'Objective: Minimize Z = x1 + x2 + x3 + x4 + x5 + x6. [cite: 34]',
            'Shift 1 (6-10AM): x6 + x1 >= 60 (Drivers from night + new starters). [cite: 34]',
            'Shift 2 (10AM-2PM): x1 + x2 >= 70. [cite: 34]',
            'Shift 3 (2PM-6PM): x2 + x3 >= 60. [cite: 34]',
            'Non-negativity: xi >= 0. [cite: 34]'
          ],
          finalAnswer: 'Min Z = sum(xi); s.t. x6+x1>=60, x1+x2>=70, x2+x3>=60, x3+x4>=50, x4+x5>=20, x5+x6>=30. [cite: 34]'
        }
        
      ],
      topics: [
        {
          id: 'qbm-01-t1',
          title: 'Modeling Process',
          summary: 'Scientific approach to decision-making.',
          concepts: [
            {
              title: 'Deterministic vs. Probabilistic',
              explanation: 'Deterministic assumes certainty (Linear Programming); Probabilistic accounts for risk (Sales Demand).',
            },
            {
              title: 'The 7-Step Cycle',
              explanation: '1. Define, 2. Develop, 3. Acquire Data, 4. Solve, 5. Test, 6. Analyze, 7. Implement.',
            },
          ],
          pageRange: { start: 2, end: 6 }
        },
        {
          id: 'qbm-01-t2',
          title: 'LP Formulation',
          summary: 'Translating business restrictions into mathematical inequalities.',
          concepts: [
            {
              title: 'Core Components',
              explanation: '• Decision Variables: Mathematical symbols representing levels of activity.\n• Objective Function: A linear relationship describing the goal (Max Profit/Min Cost).\n• Constraints: Linear inequalities representing resource limitations.'
            },
            {
              title: 'Model Structure',
              explanation: 'Every LP solution must follow this flow:\n1. Objective: Max/Min Z\n2. Constraints: s.t. (subject to)\n3. Non-negativity: Variables ≥ 0'
            }
          ],
          asciiDiagram: `
          ┌───────────────────────────────────────────────────────────┐
          │  OBJECTIVE FUNCTION (Goal: Maximize Profit / Minimize Cost)│
          ├─────────────────────────────┬─────────────────────────────┤
          │        CONSTRAINTS          │       NON-NEGATIVITY        │
          │ (Labor, Materials, Money)   │    (No negative production) │
          └─────────────────────────────┴─────────────────────────────┘
          `,
          pageRange: { start: 15, end: 20},
          solvedExamples: [
            {
              id: 'qbm-01-se-01',
              title: 'Beaver Creek Pottery Company',
              questionType: 'Formulation',
              difficulty: 'medium',
              question: 'How many bowls and mugs should be produced to maximize profits given labor and materials constraints? The product resource requirements and unit profit are as follows:',
              questionTable: `
        ┌─────────┬──────────────┬──────────────┬─────────────┐
        │ Product │    Labor     │     Clay     │    Profit   │
        │         │  (Hr./Unit)  │  (Lb./Unit)  │   ($/Unit)  │
        ├─────────┼──────────────┼──────────────┼─────────────┤
        │  Bowl   │      1       │      4       │     40      │
        │  Mug    │      2       │      3       │     50      │
        └─────────┴──────────────┴──────────────┴─────────────┘
        Resource Availability: 40 hrs of labor per day and 120 lbs of clay.`,
              asksFor: 'Model formulation to maximize daily profit.',
              identifiedValues: [
                'Profit per unit: Bowl = $40, Mug = $50',
                'Labor Capacity: 40 hours',
                'Clay Capacity: 120 pounds'
              ],
              formulaReason: 'Maximizing a linear profit objective subject to limited physical resource capacities.',
              steps: [
                'Define Decision Variables: x1 = bowls/day, x2 = mugs/day.',
                'Objective Function: Maximize Z = 40x1 + 50x2.',
                'Labor Constraint: 1x1 + 2x2 <= 40 (Available hours).',
                'Clay Constraint: 4x1 + 3x2 <= 120 (Available pounds).',
                'Non-negativity: x1, x2 >= 0.'
              ],
              finalAnswer: 'Maximize Z = 40x1 + 50x2; Subject to: x1 + 2x2 <= 40, 4x1 + 3x2 <= 120, x1, x2 >= 0.',
              examTip: 'Check if the units match; here profit is in $ and resources are in hours and pounds.'
            }
          ],
          practiceQuestions: [
            {
              id: 'qbm-01-pq-01',
              title: 'Vitamin Minimization',
              questionType: 'Formulation',
              difficulty: 'medium',
              question: 'Minimize cost for Tonic X (Rs 5) and Y (Rs 3). Requirements: Vit A >= 40, Vit D >= 50. X gives 2A/3D; Y gives 4A/2D. [cite: 35]',
              hint: 'Since these are "at least" requirements, use >= constraints. [cite: 35]',
            },
          ],
          resources: [
            { type: 'pdf', label: 'Intro & Formulation', path: '/pdfs/qbm/qbm1.pdf', pageRange: { start: 1, end: 33 } },
          ],
        },
      ],
    },
    {
      id: 'qbm-02',
      lessonNumber: 2,
      title: 'Graphical Solution of LP Models',
      covers: 'Visualizing constraints, identifying the feasible region, and finding the optimal solution using the Corner Point Method for both maximization and minimization problems.',
      tags: ['graphical-method', 'feasible-region', 'corner-points', 'optimization'],
      pdfPath: '/pdfs/qbm/qbm2.pdf',
      formulaSections: [
        {
          title: 'Corner Point Property',
          description: 'The fundamental theorem for solving LP problems graphically.',
          formulas: [
            {
              name: 'Optimal Solution Point',
              formula: 'Optimal Z occurs at an extreme point of the feasible region.',
              notation: {
                'Extreme Point': 'A corner where two or more constraints intersect',
                'Feasible Region': 'The area satisfying all constraints simultaneously'
              }
            }
          ]
        }
      ],
      numericals: [
        // --- LEARN SECTION ---
        {
          id: 'qbm-02-se-01',
          topicId: 'qbm-02-t1',
          type: 'solved-example',
          title: 'Beaver Creek Pottery (Maximization)',
          pageReference: 'Page 3-11',
          question: 'Maximize Z = $40x1 + $50x2 subject to: 1x1 + 2x2 ≤ 40 (Labor), 4x1 + 3x2 ≤ 120 (Clay), and x1, x2 ≥ 0. Find the optimal product mix of bowls (x1) and mugs (x2).',
          asksFor: 'Optimal solution using the Graphical Method.',
          identifiedValues: ['Objective: Max Z = 40x1 + 50x2', 'Constraint 1: x1 + 2x2 ≤ 40', 'Constraint 2: 4x1 + 3x2 ≤ 120'],
          formulaRef: 'Corner Point Method',
          formulaReason: 'Used to identify the optimal coordinate among all feasible vertices.',
          substitution: latex`Z = 40(24) + 50(8)`,
          elaborativeSteps: `
            Step 1: Plot Constraints as Equations.
            Line 1 (Labor): x1 + 2x2 = 40. Coordinates: (0, 20) and (40, 0).
            Line 2 (Clay): 4x1 + 3x2 = 120. Coordinates: (0, 40) and (30, 0).

            Step 2: Identify Feasible Region.
            The area common to both constraints (shaded area in the first quadrant).

            Step 3: Solve for Intersection Point (B).
            Multiply (x1 + 2x2 = 40) by 4: 4x1 + 8x2 = 160.
            Subtract (4x1 + 3x2 = 120): (4x1 - 4x1) + (8x2 - 3x2) = 160 - 120.
            5x2 = 40 => x2 = 8.
            Substitute x2=8 into Eq 1: x1 + 2(8) = 40 => x1 = 24.
            Point B is (24, 8).

            Step 4: Evaluate Corner Points.
            A(0, 20): Z = 40(0) + 50(20) = $1,000
            B(24, 8): Z = 40(24) + 50(8) = $1,360 (Optimal)
            C(30, 0): Z = 40(30) + 50(0) = $1,200
          `,
          finalAnswer: 'Optimal Solution: x1 = 24 bowls, x2 = 8 mugs; Max Profit Z = $1,360.'
        },
        {
          id: 'qbm-02-se-02',
          topicId: 'qbm-02-t1',
          type: 'solved-example',
          title: 'Fertilizer Mix (Minimization)',
          pageReference: 'Page 12-17',
          question: 'A farmer needs at least 16 lbs of nitrogen and 24 lbs of phosphate. Super-gro (x1) costs $6/bag and Crop-quick (x2) costs $3/bag. Nitrogen: 2x1 + 4x2 ≥ 16. Phosphate: 4x1 + 3x2 ≥ 24. x1, x2 ≥ 0. Minimize total cost.',
          asksFor: 'Cost minimization using graphical analysis.',
          identifiedValues: ['Min Z = 6x1 + 3x2', 'N limit: 2x1 + 4x2 ≥ 16', 'P limit: 4x1 + 3x2 ≥ 24'],
          formulaRef: 'Minimization Corner Point Analysis',
          formulaReason: 'Identifying the lowest cost vertex in an unbounded feasible region.',
          substitution: latex`Z = 6(4.8) + 3(1.6)`,
          elaborativeSteps: `
            Step 1: Plot Constraints.
            Line 1: 2x1 + 4x2 = 16. Points: (0, 4) and (8, 0).
            Line 2: 4x1 + 3x2 = 24. Points: (0, 8) and (6, 0).

            Step 2: Determine Feasible Region.
            Since constraints are ≥, the feasible region is the area above and to the right of the lines.

            Step 3: Solve for Intersection Point (B).
            Eq 1: 2x1 + 4x2 = 16 => (multiply by 2) => 4x1 + 8x2 = 32.
            Subtract Eq 2: (4x1 + 8x2) - (4x1 + 3x2) = 32 - 24.
            5x2 = 8 => x2 = 1.6.
            Sub into Eq 1: 2x1 + 4(1.6) = 16 => 2x1 = 9.6 => x1 = 4.8.
            Point B is (4.8, 1.6).

            Step 4: Evaluate Corners.
            A(0, 8): Z = 6(0) + 3(8) = $24 (Optimal)
            B(4.8, 1.6): Z = 6(4.8) + 3(1.6) = $33.6
            C(8, 0): Z = 6(8) + 3(0) = $48
          `,
          finalAnswer: 'Optimal Solution: x1 = 0 bags of Super-gro, x2 = 8 bags of Crop-quick; Min Cost Z = $24.'
        },

        // --- PRACTICE SECTION ---
        {
          id: 'qbm-02-pq-01',
          topicId: 'qbm-02-t2',
          type: 'practice-question',
          title: 'Hot Dog Mixture (Example 1)',
          pageReference: 'Page 25-26',
          question: 'A 1000-lb batch requires: at least 500 lbs of chicken (x1), at least 200 lbs of mutton (x2), and the ratio of chicken to mutton must be at least 2:1. Costs: Chicken $3/lb, Mutton $5/lb. Batch size: x1 + x2 = 1000. Formulate and solve.',
          elaborativeSteps: `
            Step 1: Variables. x1 = lbs of chicken, x2 = lbs of mutton.
            Step 2: Objective. Min Z = 3x1 + 5x2.
            Step 3: Constraints. 
            1) x1 + x2 = 1000 (Batch size)
            2) x1 ≥ 500
            3) x2 ≥ 200
            4) x1/x2 ≥ 2 => x1 - 2x2 ≥ 0
            Step 4: Graphing the single line x1 + x2 = 1000 and checking limits.
            Point 1: x1=500, x2=500. Z = 3(500)+5(500) = 4000. Ratio 1:1 (Invalid, ratio must be ≥ 2).
            Solving for Ratio 2:1: x1 = 2x2. 
            Substitute into batch: 2x2 + x2 = 1000 => 3x2 = 1000 => x2 = 333.33, x1 = 666.67.
            Check Z: 3(666.67) + 5(333.33) = 2000 + 1666.65 = $3,666.67.
          `,
          finalAnswer: 'Min Cost Z = $3,666.67 at x1 = 666.67 lbs, x2 = 333.33 lbs.'
        },
        {
          id: 'qbm-02-pq-02',
          topicId: 'qbm-02-t2',
          type: 'practice-question',
          title: 'Corner Point Analysis (Example 2)',
          pageReference: 'Page 27-29',
          question: 'Maximize Z = 4x1 + 5x2 subject to: x1 + 2x2 ≤ 10, 6x1 + 6x2 ≤ 36, x1 ≤ 4, and x1, x2 ≥ 0.',
          elaborativeSteps: `
            Step 1: Plotting lines.
            L1: x1+2x2=10 => (0,5), (10,0).
            L2: 6x1+6x2=36 => (0,6), (6,0).
            L3: x1=4 (vertical line).
            Step 2: Corner Points.
            A: (0, 5) from L1.
            B: Intersection L1 & L2. x1+2x2=10 vs x1+x2=6. Subtracting gives x2=4, x1=2. Point (2,4).
            C: Intersection L2 & L3. 6(4)+6x2=36 => 6x2=12 => x2=2. Point (4,2).
            D: (4, 0) from L3.
            Step 3: Evaluate Z.
            Z(A) = 4(0)+5(5) = 25.
            Z(B) = 4(2)+5(4) = 28. (Maximum)
            Z(C) = 4(4)+5(2) = 26.
            Z(D) = 4(4)+5(0) = 16.
          `,
          finalAnswer: 'Optimal Z = 28 at x1 = 2, x2 = 4.'
        }
      ],
      topics: [
        {
          id: 'qbm-02-t1',
          title: 'The Graphical Method',
          summary: 'A procedure for finding the optimal solution to 2-variable LP models.',
          concepts: [
            {
              title: 'Feasible Region',
              explanation: 'The set of all points that satisfy every constraint in the model simultaneously.'
            },
            {
              title: 'Extreme Points',
              explanation: 'Corners of the feasible region. The optimal solution is guaranteed to be at one of these points.'
            }
          ],
          pageRange: { start: 2, end: 11 }
        },
        {
          id: 'qbm-02-t2',
          title: 'Special Situations in LP',
          summary: 'Conditions where the standard solution path deviates.',
          concepts: [
            {
              title: 'Infeasibility',
              explanation: 'No feasible region exists because constraints are contradictory.'
            },
            {
              title: 'Unboundedness',
              explanation: 'The feasible region extends infinitely such that the objective value can increase forever.'
            },
            {
              title: 'Multiple Optimal Solutions',
              explanation: 'Occurs when the objective function is parallel to a constraint line, resulting in many optimal points.'
            }
          ],
          pageRange: { start: 19, end: 23 },
          asciiDiagram: `
            ┌─────────────────────────────────────────────────────────┐
            │               IRREGULAR LP TYPES                        │
            ├───────────────┬─────────────────┬───────────────────────┤
            │  Infeasible   │   Unbounded     │   Multiple Solutions  │
            │ (No Overlap)  │ (Open region)   │ (Parallel Obj Line)   │
            └───────────────┴─────────────────┴───────────────────────┘
          `
        }
      ]
    },
    {
      id: 'qbm-03',
      lessonNumber: 3,
      title: 'Sensitivity Analysis',
      covers: 'Post-optimality analysis, changes in objective function coefficients, and impact of resource availability (RHS) changes on the optimal solution.',
      tags: ['sensitivity-analysis', 'post-optimality', 'shadow-price', 'coefficients'],
      pdfPath: '/pdfs/qbm/qbm3.pdf',
      formulaSections: [
        {
          title: 'Range of Optimality',
          description: 'The range over which an objective function coefficient can vary without changing the optimal solution (the corner point coordinates).',
          formulas: [
            {
              name: 'Slope Comparison',
              formula: 'Slope of Objective Line must stay between Slopes of Intersecting Constraints',
              notation: {
                'Objective Slope': '-c1/c2',
                'Constraint Slopes': '-a1/a2'
              }
            }
          ]
        }
      ],
      numericals: [
        {
          id: 'qbm-03-se-01',
          topicId: 'qbm-03-t1',
          type: 'solved-example',
          title: 'Change in Objective Function Coefficient (RMC, Inc.)',
          pageReference: 'Page 4-9',
          question: 'RMC, Inc., produces a fuel additive and a solvent base using three raw materials. The original model is: \nMaximize Z = 40X + 30Y \nsubject to: \n0.4X + 0.5Y ≤ 20 (Material 1) \n0.2Y ≤ 5 (Material 2) \n0.6X + 0.3Y ≤ 21 (Material 3) \nX, Y ≥ 0 \n\nOriginal Optimal Solution: X = 25 tons, Y = 20 tons, Profit = $1,600. \n\nWhat happens to the optimal solution if the profit for the fuel additive (X) falls from $40 to $30 per ton? What if it falls further to $20 per ton?',
          questionTable: `
    ┌────────────┬───────────────────┬──────────────────┬──────────────────┐
    │ Material   │ Fuel Additive (X) │ Solvent Base (Y) │ Amount Available │
    ├────────────┼───────────────────┼──────────────────┼──────────────────┤
    │ Material 1 │ 0.4 tons          │ 0.5 tons         │ 20 tons          │
    │ Material 2 │ 0.0 tons          │ 0.2 tons         │ 5 tons           │
    │ Material 3 │ 0.6 tons          │ 0.3 tons         │ 21 tons          │
    ├────────────┼───────────────────┼──────────────────┼──────────────────┤
    │ Unit Profit│ $40               │ $30              │                  │
    └────────────┴───────────────────┴──────────────────┴──────────────────┘`,
          simplifiedBreakdown: 'We are testing the "stability" of our current best production plan (25 tons of X, 20 tons of Y). If the profit of one product drops slightly, is it still the best plan? If it drops significantly, does it become better to produce something else?',
          elaborativeSteps: `
            Step 1: Analyze the first change (Profit of X drops to $30).
            - New Objective: Max Z = 30X + 30Y.
            - The feasible region and corner points stay the same because constraints haven't changed.
            - Check current point (25, 20): Z = 30(25) + 30(20) = 750 + 600 = $1,350.
            - Since the change is small, the coordinates (25, 20) remain the optimal corner point, though the total profit decreases.

            Step 2: Analyze the second change (Profit of X drops to $20).
            - New Objective: Max Z = 20X + 30Y.
            - Check current point (25, 20): Z = 20(25) + 30(20) = 500 + 600 = $1,100.
            - Check another corner point (e.g., Point B where Material 2 and 3 intersect: X=18.75, Y=25).
            - Z at B = 20(18.75) + 30(25) = 375 + 750 = $1,125.
            - Because $1,125 > $1,100, the original optimal point (25, 20) is NO LONGER best.

            Step 3: Graph observation.
            Reducing the profit value changes the angle of the objective function line, and if it changes too much, the optimal solution moves to another corner point.
          `,
          conclusion: 'If the change is small, the original corner point remains optimal. If the change is large enough (like dropping to $20), a different corner point becomes the new optimal solution. This shows that the production plan is only "sensitive" to large profit fluctuations.'
        },
        {
          id: 'qbm-03-se-02',
          topicId: 'qbm-03-t2',
          type: 'solved-example',
          title: 'Right-Hand Side (RHS) Value Change & Shadow Price',
          pageReference: 'Page 11-13',
          question: 'Suppose that in the RMC, Inc. problem, an additional 4.5 tons of Material 3 becomes available, increasing its RHS from 21 to 25.5 tons. \nNew Model: Max 40X + 30Y subject to: \n0.4X + 0.5Y ≤ 20 \n0.2Y ≤ 5 \n0.6X + 0.3Y ≤ 25.5 \nHow does this extra material affect the profit, and what is the value of each additional ton?',
          simplifiedBreakdown: 'By getting more raw material, we are essentially moving one of our "bottleneck" walls outward. This creates more space in our graph (feasible region), allowing us to reach a higher profit level. The "Shadow Price" tells us exactly how much profit we gain for every 1 ton of extra material.',
          elaborativeSteps: `
            Step 1: Identify the Revised Constraint.
            The Material 3 constraint changes from 0.6X + 0.3Y ≤ 21 to 0.6X + 0.3Y ≤ 25.5.

            Step 2: Determine the New Intersection.
            The new optimal solution occurs where the revised Material 3 line meets the Material 1 line:
            1) 0.4X + 0.5Y = 20
            2) 0.6X + 0.3Y = 25.5
            Solving these simultaneously gives: X = 37.5 tons, Y = 10 tons.

            Step 3: Calculate New Profit.
            New Z = 40(37.5) + 30(10) = 1500 + 300 = $1,800.

            Step 4: Calculate the Shadow Price.
            - Change in Profit = New Profit ($1,800) - Old Profit ($1,600) = $200.
            - Change in Resource = 4.5 tons.
            - Shadow Price = $200 / 4.5 = $44.44 per ton.
          `,
          conclusion: 'The feasible region expands, and the new optimal profit is $1,800. The shadow price for Material 3 is $44.44 per ton. This means for every additional ton of Material 3 the company acquires, the total profit will increase by $44.44 (within the range of feasibility).'
        },
        // --- PRACTICE SECTION ---
        {
          id: "qbm-03-pq-01",
          topicId: "qbm-03-t1",
          type: "practice-question",
          title: "Profit Sensitivity Analysis (Decor Plus)",
          pageReference: "Page 4-9",
          question: "Decor Plus produces Lamps (X) and Clocks (Y). The current model is:\nMaximize Z = 50X + 40Y\nsubject to:\n2X + 4Y ≤ 80 (Labor Hours)\n3X + 2Y ≤ 60 (Material Units)\nX, Y ≥ 0\n\nOriginal Optimal Solution: X = 10, Y = 15, Profit = $1,100.\n\nWhat happens to the optimal solution if the profit for Lamps (X) falls from $50 to $40? What if it falls further to $25?",
          questionTable: `
      ┌──────────────┬───────────┬────────────┬──────────────────┐
      │ Resource     │ Lamps (X) │ Clocks (Y) │ Amount Available │
      ├──────────────┼───────────┼────────────┼──────────────────┤
      │ Labor        │ 2 hours   │ 4 hours    │ 80 hours         │
      │ Material     │ 3 units   │ 2 units    │ 60 units         │
      ├──────────────┼───────────┼────────────┼──────────────────┤
      │ Unit Profit  │ $50       │ $40        │                  │
      └──────────────┴───────────┴────────────┴──────────────────┘`,
          simplifiedBreakdown: "We are checking if our current production of 10 lamps and 15 clocks is still the most profitable if lamp prices drop. We compare the profit at our current point against other corners of the feasible region to see if the 'best' spot has moved.",
          elaborativeSteps: `
            Step 1: Analyze the first change (Profit of X drops to $40).
            - New Objective: Max Z = 40X + 40Y.
            - Check current point (10, 15): Z = 40(10) + 40(15) = 400 + 600 = $1,000.
            - Check other corner point (0, 20): Z = 40(0) + 40(20) = $800.
            - Check other corner point (20, 0): Z = 40(20) + 40(0) = $800.
            - Result: Point (10, 15) remains the highest. The solution is stable.

            Step 2: Analyze the second change (Profit of X drops to $25).
            - New Objective: Max Z = 25X + 40Y.
            - Check current point (10, 15): Z = 25(10) + 40(15) = 250 + 600 = $850.
            - Check corner point (0, 20): Z = 25(0) + 40(20) = $800.
            - Wait, let's look at the slope: New Slope = -25/40 = -0.625.
            - Labor Constraint Slope = -2/4 = -0.5. Assembly Constraint Slope = -3/2 = -1.5.
            - Since -0.625 is still between -0.5 and -1.5, the point (10, 15) actually remains optimal even at $25, though profit is much lower ($850).

            Step 3: Finding the breaking point.
            - If profit falls below $20 (where slope becomes -20/40 = -0.5), then the solution would shift to (0, 20).
          `,
          finalAnswer: "At $40, the optimal solution remains X=10, Y=15 (Profit $1,000). At $25, the solution is still X=10, Y=15 (Profit $850) because the objective function slope hasn't tilted past the labor constraint yet."
        },
        {
          id: "qbm-03-pq-02",
          topicId: "qbm-03-t2",
          type: "practice-question",
          title: "RHS Change & Shadow Price (Tech-Flow Systems)",
          pageReference: "Page 11-13",
          question: "Tech-Flow produces two valves. The current optimal profit is $2,000 using 100 kg of a specialized alloy. The constraint is 2X + 5Y ≤ 100. If the company gets 20 kg more alloy (New RHS = 120), the new optimal solution results in a profit of $2,300. Calculate the shadow price and determine if the company should buy more alloy if the market price is $12 per kg.",
          simplifiedBreakdown: "We are looking at how much 'extra' profit we make for every additional kg of alloy we get. If the profit gain (Shadow Price) is higher than the cost to buy the alloy, it is a good business decision to buy more.",
          elaborativeSteps: `
            Step 1: Identify the RHS Change.
            - Original RHS = 100 kg.
            - New RHS = 120 kg.
            - Total Change in Resource = 20 kg.

            Step 2: Identify the Profit Change.
            - Original Z = $2,000.
            - New Z = $2,300.
            - Total Change in Profit = $300.

            Step 3: Calculate the Shadow Price.
            - Shadow Price = Change in Profit / Change in Resource.
            - Shadow Price = $300 / 20 = $15 per kg.

            Step 4: Business Decision.
            - Shadow Price ($15) is the value added to profit.
            - Cost of alloy = $12.
            - Since Value ($15) > Cost ($12), the company makes a net gain of $3 per kg.
          `,
          finalAnswer: "The Shadow Price is $15 per kg. Yes, the company should buy the extra alloy because the profit increase ($15) exceeds the cost ($12)."
        }
      ],
      topics: [
        {
          id: 'qbm-03-t1',
          title: 'Introduction to Sensitivity Analysis',
          summary: 'Studying how changes in the coefficients of LP problem affect the optimal solution.',
          concepts: [
            {
              title: 'Post-Optimality Analysis',
              explanation: 'how changes in values or conditions affect the optimal solution after it is found.'
            },
            {
              title: 'Objective Function Coefficients',
              explanation: 'Changing the profit or cost per unit. If changed within a certain range, the current corner point remains optimal.'
            }
          ],
          pageRange: { start: 2, end: 5 }
        },
        {
          id: 'qbm-03-t2',
          title: 'Right-Hand Side (RHS) Changes',
          summary: 'Assessing the impact of changing resource availability.',
          concepts: [
            {
              title: 'Shadow Price',
              explanation: 'Shadow Price is the increase in total profit or value when the availability of a resource is increased by one unit.'
            },
            {
              title: 'Range of Feasibility',
              explanation: 'Range of Feasibility is the range within which a constraint can change without changing the shadow price.'
            }
          ],
          pageRange: { start: 10, end: 15 },
          asciiDiagram: `
            ┌────────────────────────────────────────────────────────┐
            │                 SENSITIVITY ANALYSIS                   │
            ├────────────────────────────┬───────────────────────────┤
            │  Change in Coefficients    │     Change in RHS         │
            │  (Rotates Objective Line)  │   (Shifts Constraint)     │
            └────────────────────────────┴───────────────────────────┘
          `
        }
      ]
    },//
    {
      id: "qbm-04",
      lessonNumber: 4,
      title: "Transportation Problem",
      covers: "Movement of goods from origins to destinations at minimum cost, including North-West Corner, Least Cost, and Vogel's Approximation methods.",
      tags: ["transportation-model", "minimization", "NWCM", "VAM", "LCM"],
      pdfPath: "/pdfs/qbm/qbm4.pdf",
      numericals: [
        {
          id: "qbm-04-se-01",
          topicId: "qbm-04-t2",
          type: "solved-example",
          title: "Vogel’s Approximation Method (VAM) Walkthrough",
          pageReference: "Page 48-51",
          question: "Find the Initial Basic Feasible Solution (IBFS) for the following transportation problem using Vogel’s Approximation Method (VAM).",
          questionTable: `
    ┌─────────┬──────┬──────┬──────┬──────┬────────┐
    │ Source  │  D1  │  D2  │  D3  │  D4  │ Supply │
    ├─────────┼──────┼──────┼──────┼──────┼────────┤
    │   S1    │  6   │  1   │  9   │  3   │   70   │
    │   S2    │  11  │  5   │  2   │  8   │   55   │
    │   S3    │  10  │  12  │  4   │  7   │   70   │
    ├─────────┼──────┼──────┼──────┼──────┼────────┤
    │ Demand  │  85  │  35  │  50  │  45  │  195   │
    └─────────┴──────┴──────┴──────┴──────┴────────┘`,
          asksFor: "Initial Basic Feasible Solution (IBFS) and Total Cost.",
          identifiedValues: ["Total Supply = 195", "Total Demand = 195", "Problem is Balanced"],
          formulaRef: "VAM Penalty Logic",
          formulaReason: "VAM is the most efficient method as it minimizes the penalty of not choosing the lowest-cost route.",
          elaborativeSteps: `
        Step 1: Calculate Row and Column Penalties
        - Row 1: |3 - 1| = 2; Row 2: |5 - 2| = 3; Row 3: |7 - 4| = 3
        - Col 1: |10 - 6| = 4; Col 2: |5 - 1| = 4; Col 3: |4 - 2| = 2; Col 4: |7 - 3| = 4

        Step 2: Select Highest Penalty
        - Highest penalty is 4 (found in multiple columns). Let's pick Column 2.
        - Cheapest cell in Col 2 is (S1, D2) with cost 1. Allocate min(Supply 70, Demand 35) = 35.
        - New Supply S1 = 35; Demand D2 = 0.

        Step 3: Recalculate Penalties and Repeat
        - Continue selecting the highest penalties and making allocations until all supply and demand are exhausted.
        - Final Allocations: (S1, D1)=35, (S1, D2)=35, (S2, D3)=50, (S2, D4)=5, (S3, D1)=30, (S3, D4)=40.

        Step 4: Verify Feasibility
        - Allocations = 6. (m + n - 1) = 3 + 4 - 1 = 6. Solution is feasible.
          `,
          finalAnswer: "Total Cost = (35*6) + (35*1) + (50*2) + (5*8) + (30*10) + (40*7) = Rs. 965."
        },
        {
          id: "qbm-04-pq-01",
          topicId: "qbm-04-t2",
          type: "practice-question",
          title: "North-West Corner Method (NWCM) Practice",
          pageReference: "Page 15",
          question: "A firm has three factories (A, B, C) and three stores (X, Y, Z). Supply: A=20, B=40, C=40. Demand: X=25, Y=25, Z=50. Using the North-West Corner Method, calculate the initial transportation cost.",
          questionTable: `
    ┌─────────┬────┬────┬────┬────────┐
    │ Factory │ X  │ Y  │ Z  │ Supply │
    ├─────────┼────┼────┼────┼────────┤
    │    A    │ 3  │ 2  │ 5  │   20   │
    │    B    │ 4  │ 5  │ 2  │   40   │
    │    C    │ 8  │ 6  │ 7  │   40   │
    ├─────────┼────┼────┼────┼────────┤
    │ Demand  │ 25 │ 25 │ 50 │  100   │
    └─────────┴────┴────┴────┴────────┘`,
          elaborativeSteps: `
        Step 1: Start at (A, X). Allocate min(20, 25) = 20. Supply A is exhausted. Move down.
        Step 2: At (B, X). Allocate min(40, 5) = 5. Demand X is exhausted. Move right.
        Step 3: At (B, Y). Allocate min(35, 25) = 25. Demand Y is exhausted. Move right.
        Step 4: At (B, Z). Allocate min(10, 50) = 10. Supply B is exhausted. Move down.
        Step 5: At (C, Z). Allocate min(40, 40) = 40. All exhausted.
          `,
          finalAnswer: "Total Cost = (20*3) + (5*4) + (25*5) + (10*2) + (40*7) = 60 + 20 + 125 + 20 + 280 = Rs. 505."
        }
      ],
      topics: [
        {
          id: "qbm-04-t1",
          title: "Fundamental Concepts",
          summary: "Introduction to origins, destinations, and balancing.",
          concepts: [
            {
              title: "Balanced vs Unbalanced",
              explanation: "If ΣSupply = ΣDemand, it is balanced. If not, add a 'Dummy' row or column with zero costs to balance it."
            },
            {
              title: "Minimization Objective",
              explanation: "The primary goal is to find the cheapest way to fulfill all demand requirements using available supply."
            }
          ],
          pageRange: { "start": 2, "end": 10 }
        },
        {
          id: "qbm-04-t2",
          title: "Solution Methodologies",
          summary: "Different approaches to finding the Initial Basic Feasible Solution (IBFS).",
          concepts: [
            {
              title: "North-West Corner Method",
              explanation: "Geographic approach: Start at the top-left cell. Fast but usually high cost."
            },
            {
              title: "Least Cost Method",
              explanation: "Economic approach: Always pick the cell with the smallest unit cost first."
            },
            {
              title: "Vogel’s Approximation Method (VAM)",
              explanation: "Penalty approach: Calculates the cost of not choosing the best option. Usually provides the best initial solution."
            }
          ],
          asciiDiagram: `
          ┌────────────────────────────────────────────────────────┐
          │               TRANSPORTATION METHODS                   │
          ├───────────────┬───────────────────┬────────────────────┤
          │   NW Corner   │    Least Cost     │       VAM          │
          │ (Top-Left Pos)│  (Min Unit Cost)  │ (Penalty Based)    │
          └───────────────┴───────────────────┴────────────────────┘
          `,
          pageRange: { "start": 12, "end": 45 }
        }
      ]
    },
    {
      id: "qbm-05",
      lessonNumber: 5,
      title: "The Assignment Problem (Hungarian Method)",
      covers: "Optimization of one-to-one allocations using the Hungarian Method to achieve minimum total cost or time.",
      tags: ["assignment-model", "hungarian-algorithm", "optimization", "resource-allocation"],
      pdfPath: "/pdfs/qbm/qbm5.pdf",
      numericals: [
            {
          id: 'qbm-05-se-01',
          topicId: 'qbm-05-t1',
          type: 'solved-example',
          title: 'Machine-Job Cost Minimization (Q4)',
          pageReference: 'Page 18',
          question: 'A workshop has four machines and four jobs to be processed. The costs of processing each job on each machine are given below. Find the optimal assignment that minimizes total cost.',
          questionTable: `
        ┌────────┬─────┬─────┬─────┬─────┐
        │        │ M1  │ M2  │ M3  │ M4  │
        ├────────┼─────┼─────┼─────┼─────┤
        │ Job 1  │ 10  │ 12  │ 19  │ 11  │
        │ Job 2  │  5  │ 10  │  7  │  8  │
        │ Job 3  │ 12  │ 14  │ 13  │ 11  │
        │ Job 4  │  8  │ 15  │ 11  │  9  │
        └────────┴─────┴─────┴─────┴─────┘`,
          asksFor: 'Optimal assignment and minimum total cost.',
          identifiedValues: ['Matrix: 4x4', 'Goal: Minimize Cost'],
          formulaRef: 'Hungarian Method',
          formulaReason: 'Discrete one-to-one mapping for cost minimization.',
          elaborativeSteps: `
        Step 1: Row Reduction. Subtract row mins (10, 5, 11, 8).
        Result: J1[0,2,9,1], J2[0,5,2,3], J3[1,3,2,0], J4[0,7,3,1].

        Step 2: Column Reduction. Subtract col mins (0, 2, 2, 0).
        Result: J1[0,0,7,1], J2[0,3,0,3], J3[1,1,0,0], J4[0,5,1,1].

        Step 3: Initial Assignment.
        - Assign J1 to M2 (0)
        - Assign J2 to M3 (0)
        - Assign J3 to M4 (0)
        - Assign J4 to M1 (0)
        
        All rows and columns covered with 4 assignments.
          `,
          finalAnswer: 'Optimal Assignment: J1-M2, J2-M3, J3-M4, J4-M1. Total Min Cost = 12 + 7 + 11 + 8 = Rs. 38.'
        },
        {
          id: 'qbm-05-se-02',
          topicId: 'qbm-05-t1',
          type: 'solved-example',
          title: 'Operator-Task Time Minimization (Q10)',
          pageReference: 'Page 18',
          question: 'Assign four tasks to four operators to minimize the total time taken (in minutes).',
          questionTable: `
        ┌────────┬─────┬─────┬─────┬─────┐
        │        │ OP1 │ OP2 │ OP3 │ OP4 │
        ├────────┼─────┼─────┼─────┼─────┤
        │ Task A │  8  │ 10  │ 17  │  9  │
        │ Task B │  3  │  8  │  5  │  6  │
        │ Task C │ 10  │ 12  │ 11  │  9  │
        │ Task D │  6  │ 13  │  9  │  7  │
        └────────┴─────┴─────┴─────┴─────┘`,
          asksFor: 'Optimal task allocation for minimum time.',
          identifiedValues: ['Matrix: 4x4', 'Goal: Minimize Time'],
          formulaRef: 'Hungarian Algorithm',
          formulaReason: 'Standard procedure for time-based assignment optimization.',
          elaborativeSteps: `
        Step 1: Row Reduction. Subtract row mins (8, 3, 9, 6).
        Result: A[0,2,9,1], B[0,5,2,3], C[1,3,2,0], D[0,7,3,1].

        Step 2: Column Reduction. Subtract col mins (0, 2, 2, 0).
        Result: A[0,0,7,1], B[0,3,0,3], C[1,1,0,0], D[0,5,1,1].

        Step 3: Assignment.
        Assignments: A-OP2, B-OP3, C-OP4, D-OP1.
        All zeros are unique in their assigned rows/cols.
          `,
          finalAnswer: 'Optimal Assignment: A-OP2, B-OP3, C-OP4, D-OP1. Total Min Time = 10 + 5 + 9 + 6 = 30 minutes.'
        },
        {
          id: 'qbm-05-pq-01',
          topicId: 'qbm-05-t1',
          type: 'practice-question',
          title: 'Cost Assignment Practice',
          pageReference: 'Page 19',
          question: 'Solve the following assignment problem to minimize the total cost:',
          questionTable: `
        ┌────────┬─────┬─────┬─────┬─────┐
        │        │  1  │  2  │  3  │  4  │
        ├────────┼─────┼─────┼─────┼─────┤
        │   A    │  1  │  4  │  6  │  3  │
        │   B    │  9  │  7  │ 10  │  9  │
        │   C    │  4  │  5  │ 11  │  7  │
        │   D    │  8  │  7  │  8  │  5  │
        └────────┴─────┴─────┴─────┴─────┘`,
          elaborativeSteps: `
        1. Subtract row mins (1, 7, 4, 5).
        2. Subtract col mins.
        3. Perform initial assignment.
        4. If assignments < 4, draw lines and adjust by the smallest uncovered value (1).
          `,
          finalAnswer: 'Optimal Assignment: A-1, B-3, C-2, D-4. Total Min Cost = 1 + 10 + 5 + 5 = 21.'
        },
        {
          id: 'qbm-05-pq-02',
          topicId: 'qbm-05-t1',
          type: 'practice-question',
          title: 'Operator-Machine Allocation (Example 9.3)',
          pageReference: 'Page 20',
          question: 'Assign five operators to five machines based on the cost matrix below:',
          questionTable: `
        ┌────────┬─────┬─────┬─────┬─────┬─────┐
        │        │ M1  │ M2  │ M3  │ M4  │ M5  │
        ├────────┼─────┼─────┼─────┼─────┼─────┤
        │  OP 1  │ 10  │  5  │ 13  │ 15  │ 16  │
        │  OP 2  │  3  │  9  │ 18  │ 13  │  6  │
        │  OP 3  │ 10  │  7  │  2  │  2  │  2  │
        │  OP 4  │  7  │ 11  │  9  │  7  │ 12  │
        │  OP 5  │  7  │  9  │ 10  │  4  │ 12  │
        └────────┴─────┴─────┴─────┴─────┴─────┘`,
          elaborativeSteps: `
        1. Perform Row and Column Reductions.
        2. Draw minimum lines to cover zeros.
        3. Revise matrix until 5 independent zeros are available for a 5x5 assignment.
          `,
          finalAnswer: 'Optimal Assignment: OP1-M2, OP2-M1, OP3-M5, OP4-M3, OP5-M4. Total Min Cost = 5 + 3 + 2 + 9 + 4 = 23.'
        }
      ],
      "topics": [
        {
          "id": "qbm-05-t1",
          "title": "The Hungarian Algorithm",
          "summary": "A systematic algorithm to find the optimal assignment.",
          "concepts": [
            {
              "title": "The Line Drawing Rule",
              "explanation": "If the number of lines required to cover all zeros equals the number of rows (n), an optimal assignment is possible. If lines < n, the matrix must be further reduced."
            },
            {
              "title": "Unbalanced Assignments",
              "explanation": "If the number of jobs does not equal the number of workers, a dummy row or column with zero costs must be added to make the matrix square."
            }
          ],
          theorySection: {
            brief: 'The Assignment Problem is a special case of the transportation problem where each source (worker/machine) has a supply of exactly 1 unit, and each destination (job/task) has a demand of exactly 1 unit. The goal is to find the pairing that minimizes total cost or time.',
            hungarianAlgorithm: 'The Hungarian Method is an efficient algorithm for solving assignment problems. It uses row and column reductions to identify opportunity costs. When a set of independent zeros (one in each row and column) is found, the optimal assignment is reached.',
            executionSteps: [
              'Step 1: Row Reduction - Subtract the smallest element in each row from every element in that row.',
              'Step 2: Column Reduction - From the resulting matrix, subtract the smallest element in each column from every element in that column.',
              'Step 3: Test for Optimality - Attempt to assign jobs to machines using zeros. If n assignments are possible for an n x n matrix, the solution is optimal.',
              'Step 4: Matrix Revision - If assignments < n, draw the minimum number of lines to cover all zeros. Find the smallest uncovered value, subtract it from all uncovered elements, and add it to elements at line intersections. Repeat until optimal.'
            ]
          },
          "asciiDiagram": `
          ┌────────────────────────────────────────────────────────┐
          │               HUNGARIAN METHOD STEPS                   │
          ├───────────────────┬───────────────────┬────────────────┤
          │  1. Row Reduce    │ 2. Col Reduce     │ 3. Assign 0s   │
          ├───────────────────┼───────────────────┼────────────────┤
          │  4. Draw Lines    │ 5. Adjust Matrix  │ 6. Final Cost  │
          └───────────────────┴───────────────────┴────────────────┘
          `,
          "pageRange": { "start": 1, "end": 17 }
        }
      ]
    },//
    {
      id: 'qbm-06',
      lessonNumber: 6,
      title: 'Decision Analysis',
      covers: 'Systematic approach to decision making under conditions of certainty, uncertainty, and risk using criteria like Maximax, EMV, and Decision Trees.',
      tags: ['decision-analysis', 'emv', 'uncertainty', 'risk', 'decision-trees'],
      pdfPath: '/pdfs/qbm/qbm6.pdf',      
      numericals: [
          {
          "id": "qbm-06-se-01",
          "topicId": "qbm-06-t1",
          "type": "solved-example",
          "title": "Thompson Lumber Case - Decision Making Under Uncertainty",
          "pageReference": "Page 5-17",
          "question": "John Thompson, president of Thompson Lumber Company, must decide whether to expand his business by manufacturing backyard storage sheds. He has identified three alternatives: building a large plant, a small plant, or doing nothing. The success depends on market demand (High, Moderate, or Low). Based on the payoff table provided, determine the best alternative using all five uncertainty models.",
          "questionTable": `
            ┌──────────────────┬──────────────┬──────────────────┬─────────────┐
            │   Alternatives   │ High Demand  │ Moderate Demand  │ Low Demand  │
            ├──────────────────┼──────────────┼──────────────────┼─────────────┤
            │ Build Large Plant│   $200,000   │     $100,000     │  -$120,000  │
            │ Build Small Plant│   $90,000    │     $50,000      │  -$20,000   │
            │ Do Nothing       │      $0      │        $0        │      $0     │
            └──────────────────┴──────────────┴──────────────────┴─────────────┘`,
          "asksFor": "Optimal decision under Maximax, Maximin, Criterion of Realism (α=0.45), Equally Likely, and Minimax Regret.",
          "identifiedValues": [
            "Large: Max=200k, Min=-120k, Avg=60k",
            "Small: Max=90k, Min=-20k, Avg=40k",
            "Nothing: Max=0, Min=0, Avg=0",
            "Alpha (α) = 0.45"
          ],
          "formulaRef": "Non-probabilistic Decision Criteria (Non-risk models)",
          "formulaReason": "Used when the decision-maker cannot assign probabilities to the various states of nature/market conditions.",
          "elaborativeSteps": `
            Step 1: Maximax (Optimistic Criterion) - PDF Page 9
            The decision-maker identifies the maximum payoff for each alternative and chooses the best.
            ┌──────────────────┬──────────────────────┐
            │   Alternatives   │ Maximum in Row (Max) │
            ├──────────────────┼──────────────────────┤
            │ Build Large Plant│       $200,000       │
            │ Build Small Plant│       $90,000        │
            │ Do Nothing       │       $0             │
            └──────────────────┴──────────────────────┘
            Decision: Build Large Plant ($200,000).

            Step 2: Maximin (Pessimistic Criterion) - PDF Page 10
            The decision-maker identifies the minimum payoff for each alternative and chooses the 'best of the worst'.
            ┌──────────────────┬──────────────────────┐
            │   Alternatives   │ Minimum in Row (Min) │
            ├──────────────────┼──────────────────────┤
            │ Build Large Plant│       -$120,000      │
            │ Build Small Plant│       -$20,000       │
            │ Do Nothing       │       $0             │
            └──────────────────┴──────────────────────┘
            Decision: Do Nothing ($0).

            Step 3: Criterion of Realism (Hurwicz) - PDF Page 12-13
            Formula: Realism Payoff = (α × Max) + (1-α) × Min. Using α = 0.45.
            - Large: (0.45 × 200,000) + (0.55 × -120,000) = 90,000 - 66,000 = $24,000
            - Small: (0.45 × 90,000) + (0.55 × -20,000) = 40,500 - 11,000 = $29,500
            - Do Nothing: (0.45 × 0) + (0.55 × 0) = $0
            ┌──────────────────┬─────────────────────┐
            │   Alternatives   │ Realism Value (0.45)│
            ├──────────────────┼─────────────────────┤
            │ Build Large Plant│       $24,000       │
            │ Build Small Plant│       $29,500       │
            │ Do Nothing       │       $0            │
            └──────────────────┴─────────────────────┘
            Decision: Build Small Plant ($29,500).

            Step 4: Equally Likely (Laplace) - PDF Page 15
            Calculates the average payoff for each alternative (Sum of payoffs / 3).
            - Large: (200,000 + 100,000 - 120,000) / 3 = $60,000
            - Small: (90,000 + 50,000 - 20,000) / 3 = $40,000
            - Do Nothing: $0 / 3 = $0
            ┌──────────────────┬──────────────────┐
            │   Alternatives   │  Row Average     │
            ├──────────────────┼──────────────────┤
            │ Build Large Plant│     $60,000      │
            │ Build Small Plant│     $40,000      │
            │ Do Nothing       │     $0           │
            └──────────────────┴──────────────────┘
            Decision: Build Large Plant ($60,000).

            Step 5: Minimax Regret - PDF Page 16-17
            1. Create Opportunity Loss (Regret) Table: [Column Max - Payoff].
              - High Demand Max: 200k | Moderate Max: 100k | Low Max: 0.
            2. Identify Maximum Regret per alternative and choose the minimum.
            ┌──────────────────┬──────────────┬──────────────┬──────────┬──────────────┐
            │   Alternatives   │ Regret (High)│ Regret (Mod) │Regret(Low)│ MAX REGRET  │
            ├──────────────────┼──────────────┼──────────────┼──────────┼──────────────┤
            │ Build Large Plant│      $0      │      $0      │ $120,000 │   $120,000   │
            │ Build Small Plant│   $110,000   │    $50,000   │ $20,000  │   $110,000   │
            │ Do Nothing       │   $200,000   │   $100,000   │ $0       │   $200,000   │
            └──────────────────┴──────────────┴──────────────┴──────────┴──────────────┘
            Decision: Build Small Plant (Minimum Max Regret = $110,000).
          `,
          "finalAnswer": "Maximax: Large Plant; Maximin: Do Nothing; Realism: Small Plant; Laplace: Large Plant; Minimax Regret: Small Plant."
        },
        {
          "id": "qbm-06-se-02",
          "topicId": "qbm-06-t1",
          "type": "solved-example",
          "title": "Steve’s Mountain Bicycle Shop - Decision Under Uncertainty",
          "pageReference": "Page 18",
          "question": "Steve’s Mountain Bicycle Shop is considering three options for its facility next year: expand his current shop, move to a larger facility, or make no change. The payoffs depend on the market conditions (Good, Average, or Poor).",
          "questionTable": `
            ┌──────────────────┬──────────────┬──────────────────┬─────────────┐
            │   Alternatives   │ Good Market  │  Average Market  │ Poor Market │
            ├──────────────────┼──────────────┼──────────────────┼─────────────┤
            │ Expand Shop      │   $76,000    │     $30,000      │  -$17,000   │
            │ Move to Larger   │   $90,000    │     $41,000      │  -$28,000   │
            │ No Change        │   $40,000    │     $15,000      │   $4,000    │
            └──────────────────┴──────────────┴──────────────────┴─────────────┘`,
          "asksFor": "Optimal decision using (a) Maximax, (b) Maximin, and (c) Equally Likely criteria.",
          "identifiedValues": [
            "Expand: Max=76k, Min=-17k",
            "Move: Max=90k, Min=-28k",
            "No Change: Max=40k, Min=4k"
          ],
          "formulaRef": "Non-Probabilistic Decision Models",
          "formulaReason": "Used when the decision maker has no information about the likelihood of specific outcomes.",
          "elaborativeSteps": `
            (a) Maximax Criterion (Optimistic)
            Logic: Identify the maximum payoff for each alternative and select the highest.
            ┌──────────────────┬──────────────────┬─────────────────┐
            │   Alternatives   │ Max in Row       │  Decision?      │
            ├──────────────────┼──────────────────┼─────────────────┤
            │ Expand Shop      │     $76,000      │                 │
            │ Move to Larger   │     $90,000      │  ★ (Highest)    │
            │ No Change        │     $40,000      │                 │
            └──────────────────┴──────────────────┴─────────────────┘
            Decision: Move to a larger facility ($90,000).

            (b) Maximin Criterion (Pessimistic)
            Logic: Identify the minimum payoff for each alternative and select the highest (best of the worst).
            ┌──────────────────┬──────────────────┬─────────────────┐
            │   Alternatives   │ Min in Row       │  Decision?      │
            ├──────────────────┼──────────────────┼─────────────────┤
            │ Expand Shop      │    -$17,000      │                 │
            │ Move to Larger   │    -$28,000      │                 │
            │ No Change        │     $4,000       │  ★ (Highest)    │
            └──────────────────┴──────────────────┴─────────────────┘
            Decision: Make no change ($4,000).

            (c) Equally Likely Criterion (Laplace)
            Logic: Calculate the average payoff for each alternative and pick the maximum.
            Calculation: (Good + Average + Poor) / 3
            - Expand: (76,000 + 30,000 - 17,000) / 3 = $89,000 / 3 = $29,666.67
            - Move: (90,000 + 41,000 - 28,000) / 3 = $103,000 / 3 = $34,333.33
            - No Change: (40,000 + 15,000 + 4,000) / 3 = $59,000 / 3 = $19,666.67
            ┌──────────────────┬──────────────────┬─────────────────┐
            │   Alternatives   │  Row Average     │  Decision?      │
            ├──────────────────┼──────────────────┼─────────────────┤
            │ Expand Shop      │    $29,666.67    │                 │
            │ Move to Larger   │    $34,333.33    │  ★ (Highest)    │
            │ No Change        │    $19,666.67    │                 │
            └──────────────────┴──────────────────┴─────────────────┘
            Decision: Move to a larger facility ($34,333.33).
          `,
          "finalAnswer": "(a) Maximax: Move to Larger Facility; (b) Maximin: No Change; (c) Equally Likely: Move to Larger Facility."
        },
        {
          "id": "qbm-06-se-03",
          "topicId": "qbm-06-t1",
          "type": "solved-example",
          "title": "Thompson Lumber Case - Decision Making Under Risk",
          "pageReference": "Page 5, 21-23",
          "question": "Using the Thompson Lumber payoff table (Page 5), determine the best decision by accounting for risk. Market research has provided the following probabilities for the states of nature: High Demand (P=0.3), Moderate Demand (P=0.5), and Low Demand (P=0.2).",
          "questionTable": `
            ┌──────────────────┬──────────────┬──────────────────┬─────────────┐
            │   Alternatives   │ High (0.3)   │ Moderate (0.5)   │ Low (0.2)   │
            ├──────────────────┼──────────────┼──────────────────┼─────────────┤
            │ Build Large Plant│   $200,000   │     $100,000     │  -$120,000  │
            │ Build Small Plant│   $90,000    │     $50,000      │  -$20,000   │
            │ Do Nothing       │      $0      │        $0        │      $0     │
            └──────────────────┴──────────────┴──────────────────┴─────────────┘`,
          "asksFor": "Optimal decision using (1) Expected Monetary Value (EMV) and (2) Expected Opportunity Loss (EOL).",
          "identifiedValues": [
            "P(High)=0.3, P(Mod)=0.5, P(Low)=0.2",
            "Large Payoffs: 200k, 100k, -120k",
            "Small Payoffs: 90k, 50k, -20k",
            "Nothing Payoffs: 0, 0, 0"
          ],
          "formulaRef": "EMV = Σ (Payoff × Probability) | EOL = Σ (Regret × Probability)",
          "formulaReason": "EMV maximizes average long-term profit; EOL minimizes average long-term regret. Both yield the same optimal decision.",
          "elaborativeSteps": `
            (1): Expected Monetary Value (EMV) - PDF Page 21
            Calculate the weighted average for each alternative:
            - EMV (Large): (200,000 × 0.3) + (100,000 × 0.5) + (-120,000 × 0.2)
              = 60,000 + 50,000 - 24,000 = $86,000
            - EMV (Small): (90,000 × 0.3) + (50,000 × 0.5) + (-20,000 × 0.2)
              = 27,000 + 25,000 - 4,000 = $48,000
            - EMV (Nothing): (0 × 0.3) + (0 × 0.5) + (0 × 0.2) = $0

            ┌──────────────────┬──────────────────────┐
            │   Alternatives   │         EMV          │
            ├──────────────────┼──────────────────────┤
            │ Build Large Plant│       $86,000        │
            │ Build Small Plant│       $48,000        │
            │ Do Nothing       │       $0             │
            └──────────────────┴──────────────────────┘
            Decision: Build Large Plant (Highest EMV).

            (2): Expected Opportunity Loss (EOL) - PDF Page 22-23
            First, convert the payoff table into a Regret (Opportunity Loss) Table.
            Regret = (Best payoff in column) - (Actual payoff).
            - Col Maxes: High=200k, Mod=100k, Low=0.
            
            Regret Table:
            - Large: [200-200=0], [100-100=0], [0-(-120)=120]
            - Small: [200-90=110], [100-50=50], [0-(-20)=20]
            - Nothing: [200-0=200], [100-0=100], [0-0=0]

            Now calculate EOL (Weighted Average of Regret):
            - EOL (Large): (0 × 0.3) + (0 × 0.5) + (120,000 × 0.2) = $24,000
            - EOL (Small): (110,000 × 0.3) + (50,000 × 0.5) + (20,000 × 0.2)
              = 33,000 + 25,000 + 4,000 = $62,000
            - EOL (Nothing): (200,000 × 0.3) + (100,000 × 0.5) + (0 × 0.2)
              = 60,000 + 50,000 + 0 = $110,000

            ┌──────────────────┬──────────────────────┐
            │   Alternatives   │         EOL          │
            ├──────────────────┼──────────────────────┤
            │ Build Large Plant│       $24,000        │
            │ Build Small Plant│       $62,000        │
            │ Do Nothing       │       $110,000       │
            └──────────────────┴──────────────────────┘
            Decision: Build Large Plant (Lowest EOL).
          `,
          "finalAnswer": "The optimal decision under risk is to Build a Large Plant, providing an EMV of $86,000 and a minimum EOL of $24,000."
        },
        {
          "id": "qbm-06-se-04",
          "topicId": "qbm-06-t2",
          "type": "solved-example",
          "title": "Thompson Lumber - Decision Tree Analysis",
          "pageReference": "Page 28-31",
          "question": "The Thompson Lumber Company is deciding whether to expand by manufacturing backyard storage sheds. They can build a large plant, a small plant, or do nothing. The market success is either Favorable or Unfavorable, each with a 50% probability. Use a decision tree to determine the best course of action.",
          "questionTable": `
            ┌──────────────────┬──────────────────┬────────────────────┐
            │   Alternatives   │ Favorable (0.5)  │ Unfavorable (0.5)  │
            ├──────────────────┼──────────────────┼────────────────────┤
            │ Construct Large  │     $200,000     │     -$180,000      │
            │ Construct Small  │     $100,000     │      -$20,000      │
            │ Do Nothing       │        $0        │         $0         │
            └──────────────────┴──────────────────┴────────────────────┘`,
          "asksFor": "A structured decision tree diagram and the calculation of Expected Monetary Values (EMV) to find the optimal decision.",
          "identifiedValues": [
            "Decision Alternatives: Large, Small, Nothing",
            "Chance Events: Favorable (P=0.5), Unfavorable (P=0.5)",
            "Nodes: Square (Decision), Circle (Chance)"
          ],
          "formulaRef": "Decision Tree Folding Back (Backward Induction)",
          "formulaReason": "This process starts from the right (outcomes) and moves to the left (decisions) by calculating the EMV for each chance node.",
          "elaborativeSteps": `
            Step 1: Structuring the Tree (As seen on Page 30-31)
            We define the Decision Node (Square) and the Chance Nodes (Circles) for each alternative.

            Step 2: The Decision Tree Diagram
            
            Decision        Chance             States of Nature            Payoffs
            Node            Nodes              (Market Conditions)         (Outcomes)
            
                                              /── Favorable (0.5) ────── $200,000
                          ┌───────○ Node 1 ──┤
                          │       (EMV=$10k)  \── Unfavorable (0.5) ─── -$180,000
                          │
            [Decision] ────┼───────○ Node 2 ───/── Favorable (0.5) ────── $100,000
              [Node]       │       (EMV=$40k)  \── Unfavorable (0.5) ──── -$20,000
                          │
                          └───────○ Node 3 ───/── Favorable (0.5) ───────── $0
                                  (EMV=$0)    \── Unfavorable (0.5) ───────── $0

            Step 3: Calculating EMV (Folding Back) - PDF Page 31
            - EMV for Node 1 (Large Plant):
              (0.5 * $200,000) + (0.5 * -$180,000) = $100,000 - $90,000 = $10,000
            
            - EMV for Node 2 (Small Plant):
              (0.5 * $100,000) + (0.5 * -$20,000) = $50,000 - $10,000 = $40,000
            
            - EMV for Node 3 (Do Nothing):
              (0.5 * $0) + (0.5 * $0) = $0

            Step 4: Making the Decision
            Compare the values at the Decision Node: $10,000 vs. $40,000 vs. $0.
            The highest EMV is $40,000.
          `,
          "finalAnswer": "Based on the decision tree analysis, Thompson Lumber should build a small plant, as it yields the highest Expected Monetary Value of $40,000."
        },
        {
          "id": "qbm-06-se-05",
          "topicId": "qbm-06-t2",
          "type": "solved-example",
          "title": "Finance Manager's Well Drilling Strategy",
          "pageReference": "Page 35-37",
          "question": "A finance manager is considering drilling a well. 70% of wells are successful at 20m. If dry at 20m, drilling can continue to 25m, where only 20% strike water. Cost is ₹500/meter. If no water is found, he must pay ₹15,000 to buy water. Options: (1) Do not drill, (2) Drill to 20m, (3) If dry at 20m, drill to 25m.",
          "asksFor": "Draw a decision tree and determine the optimal strategy by evaluating decision and chance nodes.",
          "identifiedValues": [
            "Drilling cost: ₹500/meter",
            "Cost at 20m: 20 * 500 = ₹10,000",
            "Total cost at 25m: 25 * 500 = ₹12,500",
            "Water purchase cost: ₹15,000",
            "P(Success at 20m): 0.70",
            "P(Success at 25m | Dry at 20m): 0.20"
          ],
          "formulaRef": "Expected Cash Flow (ECF) / EMV Folding Back",
          "formulaReason": "Used to evaluate sequential decisions where costs are incurred at different stages based on uncertain outcomes.",
          "elaborativeSteps": `
            Step 1: Construct the Decision Tree Diagram (Reference Page 36)
            
            Decision Node [D1] (Root):
            ├── Choice 1: Do Not Drill ─────────────────────────────────> [Cost: ₹15,000]
            │
            └── Choice 2: Drill to 20m (Cost: ₹10,000) ──○ Chance Node [C1]
                                                        ├── Water (0.7) ──────────> [Total: ₹10,000]
                                                        └── No Water (0.3) ── [D2]
                                                                                ├── Stop ───> [Total: ₹10k + ₹15k = ₹25,000]
                                                                                └── Drill to 25m (Add ₹2,500) ──○ [C2]
                                                                                                                ├── Water (0.2) ──> [Total: ₹12,500]
                                                                                                                └── No Water (0.8) ─> [₹12.5k + ₹15k = ₹27,500]

            Step 2: Evaluate Chance Node [C2] (Drilling from 20m to 25m) - Page 37
            ┌──────────────────┬─────────────┬──────────────┬──────────────────┐
            │ Event            │ Probability │  Cash Flow   │ Expected Cash Flow│
            ├──────────────────┼─────────────┼──────────────┼──────────────────┤
            │ Water at 25m     │     0.2     │   ₹12,500    │      ₹2,500      │
            │ No Water at 25m  │     0.8     │   ₹27,500    │      ₹22,000     │
            ├──────────────────┴─────────────┴──────────────┼──────────────────┤
            │ Total Expected Cost for C2                    │      ₹24,500     │
            └───────────────────────────────────────────────┴──────────────────┘

            Step 3: Evaluate Decision Node [D2] (If No Water at 20m)
            - Option A: Stop and buy water. Cost = ₹25,000
            - Option B: Drill further to 25m. Expected Cost = ₹24,500
            Decision: Drill further (choose minimum cost of ₹24,500).

            Step 4: Evaluate Chance Node [C1] (Initial 20m Drill) - Page 37
            ┌──────────────────┬─────────────┬──────────────┬──────────────────┐
            │ Event            │ Probability │  Cash Flow   │ Expected Cash Flow│
            ├──────────────────┼─────────────┼──────────────┼──────────────────┤
            │ Water at 20m     │     0.7     │   ₹10,000    │      ₹7,000      │
            │ No Water at 20m  │     0.3     │   ₹24,500* │      ₹7,350      │
            ├──────────────────┴─────────────┴──────────────┼──────────────────┤
            │ Total Expected Cost for C1                    │      ₹14,350     │
            └───────────────────────────────────────────────┴──────────────────┘
            *Uses the optimal decision value from D2.

            Step 5: Final Comparison at Decision Node [D1]
            - Option 1 (Do not drill): ₹15,000
            - Option 2 (Drill): ₹14,350
          `,
          "finalAnswer": "The optimal strategy is to drill up to 20 meters. If no water is found at that depth, the finance manager should drill further up to 25 meters. The minimum expected cost is ₹14,350."
        },
        {
          "id": "qbm-06-pq-01",
          "topicId": "qbm-06-t1",
          "type": "practice-question",
          "title": "Fitness Club Equipment Purchase - Decision Analysis",
          "pageReference": "Page 19",
          "question": "A fitness club executive is considering purchasing additional equipment (ACME, Standards, or Hypro). The payoffs depend on whether the market is Favorable or Unfavorable. Determine the best choice based on three different decision-making perspectives.",
          "questionTable": `
            ┌──────────────────┬──────────────────┬────────────────────┐
            │   Alternatives   │ Favorable Market │ Unfavorable Market │
            ├──────────────────┼──────────────────┼────────────────────┤
            │ ACME             │     $400,000     │     -$175,000      │
            │ Standards        │     $280,000     │      -$90,000      │
            │ Hypro            │     $95,000      │      -$15,000      │
            └──────────────────┴──────────────────┴────────────────────┘`,
          "asksFor": "Optimal decision for (a) an optimistic decision-maker, (b) a pessimistic decision-maker, and (c) based on a 76% favorable market probability (EMV).",
          "identifiedValues": [
            "ACME: Max=$400k, Min=-$175k",
            "Standards: Max=$280k, Min=-$90k",
            "Hypro: Max=$95k, Min=-$15k",
            "P(Favorable) = 0.76",
            "P(Unfavorable) = 0.24"
          ],
          "formulaRef": "Maximax, Maximin, and Expected Monetary Value (EMV)",
          "formulaReason": "Used to evaluate decisions under conditions of complete uncertainty and calculated risk (probabilistic).",
          "elaborativeSteps": `
            (a) Optimistic Decision Maker (Maximax)
            Logic: The executive expects the best possible outcome for each alternative and chooses the one with the highest maximum payoff.
            ┌──────────────────┬──────────────────┬─────────────────┐
            │   Alternatives   │ Max in Row       │  Decision?      │
            ├──────────────────┼──────────────────┼─────────────────┤
            │ ACME             │     $400,000     │  ★ (Highest)    │
            │ Standards        │     $280,000     │                 │
            │ Hypro            │     $95,000      │                 │
            └──────────────────┴──────────────────┴─────────────────┘
            Decision: Choose ACME ($400,000).

            (b) Pessimistic Decision Maker (Maximin)
            Logic: The executive considers the worst-case scenario for each alternative and chooses the 'best of the worst' (highest minimum).
            ┌──────────────────┬──────────────────┬─────────────────┐
            │   Alternatives   │ Min in Row       │  Decision?      │
            ├──────────────────┼──────────────────┼─────────────────┤
            │ ACME             │    -$175,000     │                 │
            │ Standards        │     -$90,000     │                 │
            │ Hypro            │     -$15,000     │  ★ (Highest)    │
            └──────────────────┴──────────────────┴─────────────────┘
            Decision: Choose Hypro (-$15,000).

            (c) Market Research Analysis (EMV)
            Logic: With a 76% (0.76) chance of a favorable market and a remaining 24% (0.24) chance of an unfavorable market, we calculate the weighted average for each.
            Formula: EMV = (0.76 × Favorable) + (0.24 × Unfavorable)
            - ACME: (0.76 × 400,000) + (0.24 × -175,000) = 304,000 - 42,000 = $262,000
            - Standards: (0.76 × 280,000) + (0.24 × -90,000) = 212,800 - 21,600 = $191,200
            - Hypro: (0.76 × 95,000) + (0.24 × -15,000) = 72,200 - 3,600 = $68,600
            ┌──────────────────┬──────────────────┬─────────────────┐
            │   Alternatives   │   Expected Value │  Decision?      │
            ├──────────────────┼──────────────────┼─────────────────┤
            │ ACME             │     $262,000     │  ★ (Highest)    │
            │ Standards        │     $191,200     │                 │
            │ Hypro            │     $68,600      │                 │
            └──────────────────┴──────────────────┴─────────────────┘
            Decision: Choose ACME ($262,000).
          `,
          "finalAnswer": "(a) Optimistic: ACME; (b) Pessimistic: Hypro; (c) Market Research (EMV): ACME."
        },
        {
          "id": "qbm-06-pq-02",
          "topicId": "qbm-06-t1",
          "type": "practice-question",
          "title": "Maria Rojas Dress Shop - Decision Under Risk",
          "pageReference": "Page 24",
          "question": "Maria Rojas is considering opening a dress shop. She must choose between a small shop, a medium-sized shop, or no shop at all. The market conditions (Good, Average, Bad) have specific probabilities. What do you recommend based on the Expected Monetary Value (EMV)?",
          "questionTable": `
            ┌──────────────────┬──────────────┬──────────────────┬─────────────┐
            │   Alternatives   │ Good (0.2)   │  Average (0.5)   │  Bad (0.3)  │
            ├──────────────────┼──────────────┼──────────────────┼─────────────┤
            │ Small Shop       │   $75,000    │     $25,000      │  -$40,000   │
            │ Medium Shop      │   $100,000   │     $35,000      │  -$60,000   │
            │ No Shop          │      $0      │        $0        │      $0     │
            └──────────────────┴──────────────┴──────────────────┴─────────────┘`,
          "asksFor": "A recommendation based on the calculation of Expected Monetary Value (EMV) for each alternative.",
          "identifiedValues": [
            "P(Good)=0.2, P(Average)=0.5, P(Bad)=0.3",
            "Small Shop Payoffs: 75k, 25k, -40k",
            "Medium Shop Payoffs: 100k, 35k, -60k",
            "No Shop Payoffs: 0, 0, 0"
          ],
          "formulaRef": "EMV = Σ (Payoff × Probability)",
          "formulaReason": "To determine the best long-term decision by weighing each outcome by its likelihood of occurrence.",
          "elaborativeSteps": `
            Step 1: Calculate EMV for the Small Shop
            Formula: (0.2 × 75,000) + (0.5 × 25,000) + (0.3 × -40,000)
            - (15,000) + (12,500) - (12,000)
            - Result: $15,500

            Step 2: Calculate EMV for the Medium Shop
            Formula: (0.2 × 100,000) + (0.5 × 35,000) + (0.3 × -60,000)
            - (20,000) + (17,500) - (18,000)
            - Result: $19,500

            Step 3: Calculate EMV for No Shop
            Formula: (0.2 × 0) + (0.5 × 0) + (0.3 × 0)
            - Result: $0

            Step 4: Summary Table of EMVs
            ┌──────────────────┬──────────────────────┐
            │   Alternatives   │         EMV          │
            ├──────────────────┼──────────────────────┤
            │ Small Shop       │       $15,500        │
            │ Medium Shop      │       $19,500        │
            │ No Shop          │       $0             │
            └──────────────────┴──────────────────────┘
            Explanation: Comparing the three values ($15,500, $19,500, and $0), the Medium Shop offers the highest expected profit.
          `,
          "finalAnswer": "I recommend Maria Rojas open a Medium-sized shop, as it yields the highest Expected Monetary Value (EMV) of $19,500."
        },
      ],
      topics: [
        {
          id: 'qbm-06-t1',
          title: 'Decision Theory Criteria',
          summary: 'Rules for choosing between alternatives under different availability of information.',
          stepsInDecisionAnalysis: {
            title: 'The Five Steps in Decision Analysis',
            description: 'A systematic approach to solving complex business problems.',
            steps: [
              {
                step: '1. Clearly define the problem',
                explanation: 'Identify the core decision that needs to be made.',
                example: 'John Thompson must decide whether to expand his business by manufacturing backyard storage sheds.'
              },
              {
                step: '2. Generate alternatives',
                explanation: 'List all possible courses of action available to the decision-maker.',
                example: 'Thompson considers three choices: Build a large plant, build a small plant, or build no plant at all.'
              },
              {
                step: '3. Identify states of nature',
                explanation: 'Identify future outcomes or market conditions that are outside the decision-maker’s control.',
                example: 'The market for sheds could be favorable (high demand) or unfavorable (low demand).'
              },
              {
                step: '4. List the payoffs',
                explanation: 'Determine the profit or cost associated with each combination of alternative and state of nature using a payoff table.',
                example: 'If a large plant is built and the market is favorable, the profit is $200,000; if unfavorable, a loss of $180,000.'
              },
              {
                step: '5. Select and apply a model',
                explanation: 'Choose a mathematical tool (like EMV or Maximax) to select the best alternative based on the environment.',
                example: 'Using the Maximax criterion to choose the alternative with the highest possible gain.'
              }
            ]
          },
          decisionEnvironments: {
            title: 'Decision-Making Environments',
            description: 'The level of information available determines the environment.',
            types: [
              {
                type: 'Decision Making Under Certainty',
                explanation: 'The decision-maker knows for sure which state of nature will occur. They simply choose the alternative that results in the best payoff for that state.'
              },
              {
                type: 'Decision Making Under Uncertainty',
                explanation: 'The decision-maker has no knowledge of the probabilities of various states of nature occurring.'
              },
              {
                type: 'Decision Making Under Risk',
                explanation: 'The decision-maker knows the probabilities of the various states of nature occurring.'
              }
            ]
          },
          uncertaintyModels: {
            title: 'Decision Making Under Uncertainty',
            description: 'Criteria used when probabilities are completely unknown.',
            models: [
              {
                name: 'Maximax (Optimistic)',
                rule: 'Find the maximum payoff for each alternative and select the highest.',
                exampleTable: 'Large Plant Max: 200k | Small Plant Max: 100k | No Plant Max: 0',
                decision: 'Build Large Plant (200k).'
              },
              {
                name: 'Maximin (Pessimistic)',
                rule: 'Find the minimum payoff for each alternative and select the highest of these.',
                exampleTable: 'Large Plant Min: -180k | Small Plant Min: -20k | No Plant Min: 0',
                decision: 'Do Nothing (0).'
              },
              {
                name: 'Criterion of Realism (Hurwicz)',
                rule: 'A weighted average using a coefficient of realism (α). Calculation: α(Max) + (1-α)(Min).',
                example: 'If α = 0.8: Large Plant = (0.8 * 200k) + (0.2 * -180k) = 124,000.',
                decision: 'Select alternative with highest weighted value.'
              },
              {
                name: 'Equally Likely (Laplace)',
                rule: 'Assume all states are equally likely; find the average payoff for each alternative.',
                example: 'Large Plant Average: (200k - 180k) / 2 = 10,000.',
                decision: 'Select alternative with highest average.'
              },
              {
                name: 'Minimax Regret',
                rule: 'Based on Opportunity Loss. First, create a regret table by subtracting each payoff from the best payoff in that column. Then, find the maximum regret for each row and pick the minimum.',
                logic: 'Minimize the "soreness" of making a wrong decision.'
              }
            ]
          },
          riskModels: {
            title: 'Decision Making Under Risk',
            description: 'Criteria used when probabilities (e.g., 60% chance of success) are assigned to states of nature.',
            models: [
              {
                name: 'Expected Monetary Value (EMV)',
                explanation: 'The weighted average value for each alternative.',
                formula: 'EMV = Σ (Payoff of State i * Probability of State i)',
                example: 'Large Plant with 0.5 Prob: (200k * 0.5) + (-180k * 0.5) = 10k EMV.'
              },
              {
                name: 'Expected Opportunity Loss (EOL)',
                explanation: 'The expected value of the regret/opportunity loss table.',
                logic: 'Calculated similarly to EMV but using the Regret Table. The alternative with the minimum EOL will always be the same as the one with maximum EMV.'
              }
            ]
          },
          pageRange: { start: 1, end: 19 }
        },
        {
          id: 'qbm-06-t2',
          title: 'Decision Trees',
          summary: 'Graphical tools for complex decision problems involving sequences of decisions and outcomes.',
          components: [
            {
              node: 'Decision Node (Square □)',
              purpose: 'Indicates a point where the decision-maker must choose an alternative.'
            },
            {
              node: 'State-of-Nature Node (Circle ○)',
              purpose: 'Indicates where an outcome occurs based on probabilities.'
            }
          ],
          steps: [
            '1. Define the problem.',
            '2. Structure/Draw the tree from left to right.',
            '3. Assign probabilities to state-of-nature nodes.',
            '4. Estimate payoffs for each possible combination.',
            '5. Solve the problem by "Folding Back" (computing EMVs from right to left).'
          ],
          foldingBack: {
            concept: 'The process of calculating values from the end of the branches back to the start.',
            action: 'At each circle node, calculate the EMV. At each square node, choose the branch with the highest EMV and "prune" (ignore) the others.'
          },
          pageRange: { start: 20, end: 37 }
        }
      ]
    },//
   {
      "id": "qbm-07",
      "lessonNumber": 7,
      "title": "Queuing Models / Waiting Line Model",
      "covers": "Study of waiting lines and the trade-off between service costs and customer waiting costs using probabilistic models like M/M/1.",
      "tags": ["queuing-theory", "waiting-lines", "lambda-mu", "mm1-model", "utilization"],
      "pdfPath": "/pdfs/qbm/qbm7.pdf",
      "formulaSections": [
        {
          "title": "Queuing Model Formulas (M/M/1 Model)",
          "description": "Mathematical models for single-channel, single-phase systems with Poisson arrivals and Exponential service times as listed on pages 11 and 12.",
          "formulas": [
            {
              "name": "Average number of customers being served",
              "formula": "r = λ / μ",
              "latex": "r = \\frac{\\lambda}{\\mu}",
              "notation": {
                "λ (Lambda)": "Mean arrival rate",
                "μ (Mu)": "Mean service rate"
              }
            },
            {
              "name": "Average number of customers waiting in line (Lq)",
              "formula": "Lq = λ² / [μ(μ - λ)]",
              "latex": "L_q = \\frac{\\lambda^2}{\\mu(\\mu - \\lambda)}",
              "notation": {
                "Lq": "Average number of customers in the waiting line"
              }
            },
            {
              "name": "Average number of customers in the system (Ls)",
              "formula": "Ls = Lq + (λ / μ)",
              "latex": "L_s = L_q + r",
              "notation": {
                "Ls": "Average number of customers in the total system"
              }
            },
            {
              "name": "Average time customers wait in line (Wq)",
              "formula": "Wq = Lq / λ",
              "latex": "W_q = \\frac{L_q}{\\lambda}",
              "notation": {
                "Wq": "Average waiting time in the line"
              }
            },
            {
              "name": "Average time customers wait in the system (Ws)",
              "formula": "Ws = Wq + (1 / μ)",
              "latex": "W_s = W_q + \\frac{1}{\\mu}",
              "notation": {
                "Ws": "Average total time spent in the system"
              }
            },
            {
              "name": "System Utilization (ρ)",
              "formula": "ρ = λ / μ",
              "latex": "\\rho = \\frac{\\lambda}{\\mu}",
              "notation": {
                "ρ": "The percentage of time the server is busy"
              }
            },
            {
              "name": "Probability of zero customers in the system (P0)",
              "formula": "P0 = 1 - (λ / μ)",
              "latex": "P_0 = 1 - \\frac{\\lambda}{\\mu}",
              "notation": {
                "P0": "Probability the system is empty (idle)"
              }
            },
            {
              "name": "Probability of n customers in the system (Pn)",
              "formula": "Pn = P0 * (λ / μ)ⁿ",
              "latex": "P_n = P_0 \\cdot (\\frac{\\lambda}{\\mu})^n",
              "notation": {
                "n": "Specific number of customers"
              }
            },
            {
              "name": "Probability of Less than n Customers in the System",
              "formula": "P(n < k) = 1 - (λ / μ)ᵏ",
              "latex": "P(n < k) = 1 - \\left( \\frac{\\lambda}{\\mu} \\right)^k",
              "notation": {
                "k": "Number of customers being compared against",
                "P(n < k)": "The cumulative probability that fewer than k customers are present"
              }
            },
          ]
        }
      ],
      "numericals": [
        {
          "id": "qbm-07-se-01",
          "topicId": "qbm-07-t1",
          "type": "solved-example",
          "title": "Bakery Service System Numerical",
          "pageReference": "Page 13-14",
          "question": "Customers arrive at a bakery at an average rate of 18 per hour on weekday mornings. The arrival distribution is Poisson. Each clerk can serve a customer in an average of 3 minutes; this time is exponentially distributed.",
          "identifiedValues": [
            "Arrival rate (λ) = 18 customers/hour",
            "Service time = 3 minutes per customer",
            "Service rate (μ) = 60 / 3 = 20 customers/hour",
            "Avg number waiting in line (Lq) = 8.1 (Given for part C)"
          ],
          "formulaRef": "M/M/1 Queuing Formulas",
          "formulaReason": "The system features a single server (one clerk), random arrivals (Poisson), and variable service time (Exponential).",
          "elaborativeSteps":`
            Answer A: Identify Arrival and Service Rates
              -explanation: To solve queuing problems, both rates must be in the same time unit (hours). λ is given as 18/hr. Since service takes 3 minutes, we calculate μ by seeing how many 3-minute intervals fit into 60 minutes.,
              -calculation: λ = 18 customers/hr; μ = 60 / 3 = 20 customers/hr,
              -result: λ = 18, μ = 20


            Answer B: Average Number of Customers Being Served (R),
              -explanation: This is the ratio of arrival rate to service rate, representing the average number of customers currently at the counter.,
              -calculation: R = λ / μ = 18 / 20,
              -result: 0.9 customers
            
            
            Answer C: Average Number of Customers in the System (Ls)
              -explanation: "The system includes both those waiting in line (Lq) and those being served. Since Lq is given as 8.1, we add the average number being served (calculated in Step 2).
              -calculation: "Ls = Lq + (λ / μ) = 8.1 + 0.9
              -result: 9.0 customers
            
            
            Answer D: System Utilization (P)
              -explanation: This calculates the probability that the server is busy, expressed as a percentage of time.
              -calculation: P = λ / μ = 18 / 20 = 0.9
              -result: 90%
            `,
          "finalAnswer": "A) λ = 18, μ = 20; B) Avg Served = 0.9; C) Ls = 9.0; D) Utilization = 90%."
        },
        {
          "id": "qbm-07-se-02",
          "topicId": "qbm-07-t1",
          "type": "solved-example",
          "title": "Airline Ticket Desk Analysis",
          "pageReference": "Page 15-16",
          "question": "An airline is planning to open a ticket desk staffed by one ticket agent. It is estimated that requests for tickets will average 15 per hour and will follow a Poisson distribution. The agent can service a request in an average of 3 minutes, following an exponential distribution.",
          "asksFor": "System utilization, average number of customers waiting in line, average number of customers in the system, average waiting time in line, and average waiting time in the system.",
          "identifiedValues": [
            "Arrival rate (λ) = 15/hr",
            "Service time = 3 mins/customer",
            "Service rate (μ) = 60 / 3 = 20/hr"
          ],
          "formulaRef": "M/M/1 Queuing Model Performance Measures",
          "formulaReason": "This model is applied because there is a single server (one agent), random arrivals, and variable service times.",
          "elaborativeSteps": `
            Answer A: Determine Service Rate (μ) and System Utilization (P).
            - Arrival rate (λ) is already given as 15 per hour.
            - Service rate (μ) must be converted to hours: 60 minutes / 3 minutes = 20 per hour.
            - System Utilization (P) formula: P = λ / μ.
            - Calculation: 15 / 20 = 0.75.
            Result: The agent will be busy 75% of the time. (Answer A)

            Answer B: Average Number of Customers Waiting in Line (Lq).
            - Why this formula? It calculates the length of the queue excluding the person being served.
            - Formula: Lq = λ² / [μ(μ - λ)]
            - Substitution: 15² / [20(20 - 15)] = 225 / [20(5)] = 225 / 100 = 2.25.
            Result: On average, 2.25 customers are waiting in line. (Answer B)

            Answer C: Average Number of Customers in the System (Ls).
            - Why this formula? It accounts for everyone at the desk (waiting + being served).
            - Formula: Ls = λ / (μ - λ)
            - Substitution: 15 / (20 - 15) = 15 / 5 = 3.
            Result: There are 3 customers in the system on average. (Answer C)

            Answer D: Average Waiting Time in Line (Wq).
            - Why this formula? It converts the queue length into a time measurement.
            - Formula: Wq = Lq / λ
            - Substitution: 2.25 / 15 = 0.15 hours.
            - To make it understandable for students, convert to minutes: 0.15 * 60 = 9 minutes.
            Result: 9 minutes. (Answer D)

            Answer E: Average Waiting Time in the System (Ws).
            - Why this formula? It calculates the total time from arrival until the ticket is issued.
            - Formula: Ws = Ls / λ (or Wq + 1/μ)
            - Substitution: 3 / 15 = 0.20 hours.
            - Conversion to minutes: 0.20 * 60 = 12 minutes.
            Result: 12 minutes. (Answer E)
          `,
          "finalAnswer": "A) Utilization=0.75; B) Lq=2.25 customers; C) Ls=3 customers; D) Wq=9 mins; E) Ws=12 mins."
        },
        {
          "id": "qbm-07-se-03",
          "topicId": "qbm-07-t1",
          "type": "solved-example",
          "title": "Fast-Food Drive-up Window Case Study",
          "pageReference": "Page 17-21",
          "question": "Assume a drive-up window at a fast-food restaurant. Customers arrive at a rate of 25 per hour. The employee can serve one customer every two minutes. Assume Poisson arrivals and an exponential service rate.",
          "asksFor": "System utilization, average number in queue, average number in system, average wait in queue, average wait in system, and probability of exactly two cars in the system.",
          "identifiedValues": [
            "Arrival rate (λ) = 25/hr",
            "Service time = 2 mins/customer",
            "Service rate (μ) = 60 / 2 = 30/hr"
          ],
          "formulaRef": "M/M/1 Queuing Equations",
          "formulaReason": "This is a single-channel (one window) system with random arrivals and variable service times.",
          "elaborativeSteps": `
            Answer A: Calculate Service Rate (μ) and Utilization (P) - Page 18-19.
            - λ is 25 customers per hour.
            - μ is calculated by: 60 minutes ÷ 2 minutes = 30 customers per hour.
            - P (Utilization) = λ / μ = 25 / 30 = 0.8333.
            Explanation: The employee is busy 83.33% of the time. (Answer A)

            Answer B: Average Number of Customers in Queue (Lq) - Page 20.
            - Why this formula? It finds the average number of cars waiting behind the car being served.
            - Formula: Lq = λ² / [μ(μ - λ)]
            - Calculation: 25² / [30(30 - 25)] = 625 / [30 * 5] = 625 / 150 = 4.167.
            Result: Average of 4.167 cars in line. (Answer B)

            Answer C: Average Number of Customers in the System (Ls) - Page 20.
            - Why this formula? It finds the total cars in the drive-thru (waiting + at the window).
            - Formula: Ls = λ / (μ - λ)
            - Calculation: 25 / (30 - 25) = 25 / 5 = 5.
            Result: Average of 5 cars in the system. (Answer C)

            Answer D: Average Waiting Time in Line (Wq) - Page 20.
            - Why this formula? It tells us how long a customer sits in the queue before reaching the window.
            - Formula: Wq = Lq / λ
            - Calculation: 4.167 / 25 = 0.1667 hours.
            - Convert to minutes: 0.1667 * 60 = 10 minutes.
            Result: Customers wait 10 minutes in line. (Answer D)

            Answer E: Average Waiting Time in the System (Ws) - Page 21.
            - Why this formula? It represents the total time from joining the line to driving away with food.
            - Formula: Ws = Ls / λ
            - Calculation: 5 / 25 = 0.2 hours.
            - Convert to minutes: 0.2 * 60 = 12 minutes.
            Result: Total time in system is 12 minutes. (Answer E)

            Answer F: Probability of Exactly Two Cars in System (P2) - Page 21.
            - Why this formula? Used to find the chance of a specific number (n) of customers being present.
            - Formula: Pn = (1 - λ/μ) * (λ/μ)ⁿ
            - Substitution: P2 = (1 - 25/30) * (25/30)²
            - Calculation: (1/6) * (0.8333)² = 0.1667 * 0.6944 = 0.1157.
            Result: There is an 11.57% chance that exactly 2 cars are present. (Answer F)
          `,
          "finalAnswer": "A) P=0.8333; B) Lq=4.167; C) Ls=5; D) Wq=10 mins; E) Ws=12 mins; F) P2=0.1157."
        },
        {
          "id": "qbm-07-pq-01",
          "topicId": "qbm-07-t1",
          "type": "practice-question",
          "title": "Clinic Doctor-Patient Queuing Analysis",
          "pageReference": "Page 22-23",
          "question": "Customers arrive at a clinic at the rate of 8 per hour (Poisson arrival) and the doctor can serve at the rate of 9 per hour (exponential service time).",
          "asksFor": "Probability of walking in directly, probability of no queue, average number of patients in system, average number of patients in queue, and average time in the system.",
          "identifiedValues": [
            "Arrival rate (λ) = 8/hr",
            "Service rate (μ) = 9/hr"
          ],
          "formulaRef": "M/M/1 Performance Measures & Probability Formulas",
          "formulaReason": "Used to analyze a single-doctor (single-server) medical facility to optimize patient wait times.",
          "elaborativeSteps": `
            Step 1: Probability of Walking Directly into the Doctor's Room (Question A).
            - Logic: A patient walks in directly only if there are ZERO people in the clinic.
            - Formula: P0 = 1 - (λ / μ)
            - Calculation: 1 - (8 / 9) = 1/9 = 0.111.
            Result: 11.1% probability. (Answer A)

            Step 2: Probability of No Queue (Question B).
            - Logic: 'No queue' means there are either 0 people or 1 person (who is currently being served) in the system.
            - Formula: P(n < 2) = P0 + P1
            - Step 2a: P0 = 0.111
            - Step 2b: P1 = (1 - λ/μ) * (λ/μ)¹ = (1/9) * (8/9) = 8/81 = 0.0987.
            - Calculation: 0.111 + 0.0987 = 0.2097.
            Result: 20.97% probability that no one is waiting in line. (Answer B)

            Step 3: Average Number of Patients in the System (Ls) (Question C).
            - Why this formula? It calculates the total load on the clinic (waiting + being treated).
            - Formula: Ls = λ / (μ - λ)
            - Calculation: 8 / (9 - 8) = 8 / 1 = 8.
            Result: Average of 8 patients in the system. (Answer C)

            Step 4: Average Number of Patients in the Queue (Lq) (Question D).
            - Why this formula? It isolates only those patients who are sitting in the waiting area.
            - Formula: Lq = λ² / [μ(μ - λ)]
            - Calculation: 8² / [9(9 - 8)] = 64 / [9 * 1] = 64 / 9 = 7.11.
            Result: Average of 7.11 patients waiting. (Answer D)

            Step 5: Average Time a Patient Spends in the Clinic (Ws) (Question E).
            - Why this formula? To find the total cycle time per patient.
            - Formula: Ws = 1 / (μ - λ)
            - Calculation: 1 / (9 - 8) = 1 hour.
            Result: A patient spends 1 hour on average in the clinic. (Answer E)
          `,
          "finalAnswer": "A) P0=0.111; B) P(No Queue)=0.2097; C) Ls=8 patients; D) Lq=7.11 patients; E) Ws=1 hour."
        },
      ],
      "topics": [
        {
          "id": "qbm-07-t1",
          "title": "Queuing System Basics",
          "summary": "Concepts of waiting lines and system performance measures.",
          "theorySection": {
            "brief": "Waiting lines occur when demand exceeds service capacity. The goal is to balance service costs and waiting costs.",
            "characteristics": [
              "Population Source: Infinite (unlimited) or Finite (limited pool).",
              "Arrival Pattern: Number of arrivals usually follows a Poisson distribution.",
              "Service Pattern: Service times usually follow an Exponential distribution.",
              "Queue Discipline: Order of service, typically First-Come, First-Served (FCFS).",
              "Customer Behaviors: Balking (refusing to join), Reneging (leaving the line), and Jockeying (switching lines)."
            ],
            "performanceMeasures": [
              "Utilization: Percent of time server is busy.",
              "Lq / Ls: Average number of customers in queue / system.",
              "Wq / Ws: Average time spent in queue / system."
            ]
          },
          "asciiDiagram": `
          [ Arrivals ] ───▶ [ Queue/Waiting Line ] ───▶ [ Service Facility ] ───▶ [ Departures ]
              (λ)                                            (μ)
          `,
          "pageRange": { "start": 1, "end": 12 }
        }
      ]
    },//
    {
      "id": "qbm-08",
      "lessonNumber": 8,
      "title": "Forecasting",
      "status": "Coming Soon",
      "description": "This lesson will cover quantitative and qualitative forecasting techniques, including Moving Averages, Exponential Smoothing, and Trend Projection to predict future business demand.",
      "covers": "Time-series analysis, smoothing constants, and error measurement (MAD, MSE).",
      "tags": ["forecasting", "time-series", "moving-average", "exponential-smoothing", "trend-analysis"]
    },//
  ],
}
