export const ORGANIZATIONAL_BEHAVIOR_SUBJECT = {
  id: 'ob',
  title: 'Organizational Behavior',
  description:
    'Theory-focused StudyMe roadmap for understanding individual behavior, teams, motivation, leadership, and organizational processes.',
  contentType: 'theory',
  status: 'active',
  pdfPath: '/pdfs/ob/ob1.pdf',
  lessons: [
    {
      id: 'ob-01',
      lessonNumber: 1,
      title: 'Foundation for Organizational Behavior',
      pdfPath: '/pdfs/ob/ob1.pdf',
      covers: 'Defines OB, explores contributing behavioral sciences, and identifies managerial challenges and opportunities.',
      pageRange: { start: 1, end: 20 },
      tags: ['introductory', 'foundational', 'human-centric'],
      resources: [
        { type: 'pdf', label: 'Chapter 1 Notes', path: '/pdfs/ob/ob1.pdf', pageRange: { start: 1, end: 20 } },
      ],
      topics: [
        {
          id: 'ob-01-t2',
          title: 'Contributing Disciplines to the OB Field',
          summary: 'OB is an applied behavioral science built on contributions from several disciplines focusing on different levels of analysis.',
          keyConcepts: ['Micro-level (Individual)', 'Macro-level (Groups/Systems)', 'Interdisciplinary approach'],
          subtopics: [
            'Psychology: Focus on the individual (learning, personality, motivation)',
            'Social Psychology: Focus on influence and group behavior',
            'Sociology: Focus on people in relation to social environment/culture',
            'Anthropology: Focus on societies and fundamental values',
            'Political Science: Focus on power and conflict in political environments'
          ],
          comparisonTable: {
            title: 'Disciplines and Levels of Analysis',
            headers: ['Discipline', 'Unit of Analysis', 'Key Contribution Area'],
            rows: [
              ['Psychology', 'Individual', 'Motivation, Perception, Leadership effectiveness'],
              ['Social Psychology', 'Group', 'Communication, Patterns of behavior, Change'],
              ['Sociology', 'Organization System', 'Organizational culture, Formal organization theory'],
              ['Anthropology', 'Organization System', 'Comparative values, Cross-cultural analysis'],
            ],
          },
          pageRange: { start: 11, end: 15 },
          hasExamples: false,
        },
        {
          id: 'ob-01-t3',
          title: 'Challenges and Opportunities for OB',
          summary: 'Managers face shifting pressures including economic volatility, globalization, and the need for ethical leadership.',
          definitions: [
            { term: 'Workforce Diversity', description: 'The concept that organizations are becoming more heterogeneous in terms of gender, age, race, and ethnicity.' },
            { term: 'Ethical Dilemmas', description: 'Situations in which individuals are required to define right and wrong conduct.' }
          ],
          keyConcepts: ['Globalization', 'Work-Life Balance', 'Innovation', 'Sustainability'],
          examples: ['Salesforce Hyderabad (Day care)', 'United Airlines (Ethical crisis)', 'Kodak/Nokia (Failure to innovate)'],
          subtopics: [
            'Responding to economic pressures',
            'Managing workforce diversity',
            'Improving customer service and people skills',
            'Helping employees with work-life conflicts',
            'Creating a positive and ethical work environment'
          ],
          pageRange: { start: 16, end: 20 },
          hasExamples: true,
        }
      ],
    },
    {
      id: 'ob-02',
      lessonNumber: 2,
      title: 'Personality, Attitude, & Values',
      pdfPath: '/pdfs/ob/ob2.pdf',
      covers: 'Explores personality traits (Big Five), career alignment (Holland’s Typology), types of values, and the components of job attitudes.',
      pageRange: { start: 1, end: 33 },
      tags: ['psychology-focused', 'career-alignment', 'individual-behavior'],
      resources: [
        { type: 'pdf', label: 'Lesson 2 Notes', path: '/pdfs/ob/ob2.pdf', pageRange: { start: 1, end: 33 } },
      ],
      topics: [
        {
      id: 'ob-02-t1',
      title: 'Personality: Definitions & Determinants',
      summary: 'Personality is the sum total of ways an individual reacts to and interacts with others. It is not just one trait but a combination of enduring characteristics.',
      asciiDiagram: `
      DETERMINANTS OF PERSONALITY
      +-----------+       +-------------+       +-----------+
      | HEREDITY  | ----> | ENVIRONMENT | ----> | SITUATION |
      +-----------+       +-------------+       +-----------+
      (Genetics at       (Culture, Family,     (Context-dependent
       conception)        Social Groups)        expression)
      `,
      definitions: [
        { term: 'Personality', description: 'Enduring characteristics that describe an individual’s behavior and the ways they interact with their environment.' },
        { term: 'Heredity', description: 'Factors determined at conception, including physical attributes, temperament, and biological rhythms.' }
      ],
      details: 'Personality is shaped by three main factors: heredity, environment, and situation. Heredity means the qualities we get from our parents through genes, which form the basic foundation of personality. Environment includes family, culture, friends, school, and society, all of which influence how a person thinks and behaves. Situation also affects personality because people may behave differently in different places or conditions. These factors work together to develop and express a person’s personality over time.',
      pageRange: { start: 5, end: 6 },
      hasExamples: true
    },
    {
      id: 'ob-02-t2',
      title: 'The Big Five Personality Model (OCEAN)',
      summary: 'OCEAN = Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.',
      definitions: [
        { term: 'Extraversion', description: 'Captures comfort level with relationships. Extraverts are gregarious and assertive; Introverts are reserved and quiet.' },
        { term: 'Agreeableness', description: 'Propensity to defer to others. High scorers are cooperative and trusting; low scorers are antagonistic or cold.' },
        { term: 'Conscientiousness', description: 'A measure of reliability. Highly conscientious people are organized, dependable, and persistent.' },
        { term: 'Emotional Stability', description: 'Ability to withstand stress. Positive scores indicate calm and secure individuals; high negative scores (Neuroticism) indicate anxiety and insecurity.' },
        { term: 'Openness to Experience', description: 'Range of interests and fascination with novelty. Extremely open people are creative, curious, and artistically sensitive.' }
      ],
      comparisonTable: {
        title: 'Big Five Traits & Organizational Influence',
        headers: ['Trait', 'Why it is Relevant', 'OB Outcomes'],
        rows: [
          ['Emotional Stability', 'Less negative thinking/hyper-vigilance', 'Higher job satisfaction, lower stress'],
          ['Extraversion', 'Better interpersonal skills & social dominance', 'Higher performance, enhanced leadership'],
          ['Openness', 'Increased learning, flexibility, & creativity', 'Adaptable to change, training proficiency'],
          ['Agreeableness', 'Better liked, compliant, and conforming', 'Lower deviant behavior, high performance (teamwork)'],
          ['Conscientiousness', 'Greater effort, persistence, and discipline', 'Higher performance, greater longevity']
        ]
      },
      pageRange: { start: 7, end: 11 }
    },
    {
      id: 'ob-02-t3',
      title: "Holland's Job Typology (RIASEC)",
      summary: 'This theory proposes that satisfaction and the propensity to leave a job depend on the degree to which individuals match their personalities to an occupational environment.',
      asciiDiagram: `
               (R) REALISTIC <------> (I) INVESTIGATIVE
                    ^                        ^
                    |                        |
             (C) CONVENTIONAL          (A) ARTISTIC
                    |                        |
                    v                        v
              (E) ENTERPRISING <------> (S) SOCIAL
      `,
      details: 'The RIASEC model uses a hexagonal structure to show the relationship between six personality types. The closer two types are on the hexagon, the more compatible they are.',
      definitions: [
        { term: 'Realistic (Doers)', description: 'Prefers physical activities requiring skill and coordination. Examples: Mechanic, Farmer.' },
        { term: 'Investigative (Thinkers)', description: 'Prefers activities involving thinking, organizing, and understanding. Examples: Biologist, Economist.' },
        { term: 'Artistic (Creators)', description: 'Prefers ambiguous and unsystematic activities that allow creative expression. Examples: Writer, Musician.' },
        { term: 'Social (Helpers)', description: 'Prefers activities that involve helping and developing others. Examples: Social worker, Teacher.' },
        { term: 'Enterprising (Persuaders)', description: 'Prefers verbal activities where there are opportunities to influence others and attain power. Examples: Lawyer, Manager.' },
        { term: 'Conventional (Organizers)', description: 'Prefers rule-regulated, orderly, and unambiguous activities. Examples: Accountant, Bank Teller.' }
      ],
      pageRange: { start: 15, end: 17 }
    },
    {
      id: 'ob-02-t4',
      title: 'Values: Terminal vs. Instrumental',
      summary: 'Values represent stable, long-lasting beliefs about what is "good" or "desirable." They provide the foundation for attitudes and motivation.',
      comparisonTable: {
        title: 'Types of Values',
        headers: ['Category', 'Definition', 'Examples'],
        rows: [
          ['Terminal Values', 'Desirable end-states/goals a person wants to achieve in their lifetime.', 'Prosperity, Freedom, Health, World Peace'],
          ['Instrumental Values', 'Preferable modes of behavior or means of achieving terminal goals.', 'Self-improvement, Kindness, Discipline, Ambition']
        ]
      },
      details: 'Values are collective conceptions of what is considered proper or improper in a culture. In OB, understanding a person’s values is critical because they influence perception and cloud our interpretation of right and wrong.',
      pageRange: { start: 19, end: 24 }
    },
    {
      id: 'ob-02-t5',
      title: 'Attitude & Its Components',
      summary: 'Attitudes are evaluative statements—either favorable or unfavorable—concerning objects, people, or events. They reflect how we feel about something.',
      details: 'Attitudes are influenced by past experiences, social roles, and norms. They are often learned through classical conditioning (e.g., advertisements creating a favorable reaction to a product).',
      asciiDiagram: `
           THE 3 COMPONENTS OF ATTITUDE (ABC Model)
          +-------------------------------------------+
          | COGNITIVE |  Evaluation (Belief/Opinion)  |
          +-----------+-------------------------------+
          | AFFECTIVE |  Feeling (Emotion/Sensation)  |
          +-----------+-------------------------------+
          | BEHAVIORAL|  Action (Intention to behave) |
          +-----------+-------------------------------+
      `,
      majorJobAttitudes: [
        { term: 'Job Satisfaction', description: 'A positive feeling about a job resulting from an evaluation of its characteristics.' },
        { term: 'Job Involvement', description: 'The degree to which people identify psychologically with their job and consider performance important to self-worth.' },
        { term: 'Psychological Empowerment', description: 'Employees’ beliefs in the degree to which they influence their work environment and their perceived autonomy.' }
      ],
      pageRange: { start: 25, end: 35 }
    }
      ],
    },//
    {
      id: 'ob-03',
      lessonNumber: 3,
      title: 'Perception & Decision Making',
      pdfPath: '/pdfs/ob/ob3.pdf',
      covers: 'Analysis of the perceptual process, attribution theory, shortcuts in judging others, and the link between perception and individual decision-making.',
      pageRange: { start: 1, end: 41 },
      tags: ['cognitive-psychology', 'bias-awareness', 'managerial-decisions'],
      resources: [
        { type: 'pdf', label: 'Lesson 3 Comprehensive Notes', path: '/pdfs/ob/ob3.pdf', pageRange: { start: 1, end: 41 } },
      ],
      topics: [
        {
          id: 'ob-03-t1',
          title: 'The Process of Perception',
          summary: 'Perception is the process by which individuals organize and interpret sensory impressions to give meaning to their environment.',
          details: 'In OB, perception is critical because peoples behavior is based on their perception of what reality is, not on reality itself. The process involves three stages: Selection (filtering inputs), Organization (grouping information), and Interpretation (assigning meaning).',
          asciiDiagram: `
          STAGES OF PERCEPTION
          [Selection] -> [Organization] -> [Interpretation]
              ^                                 |
              |---------- Feedback Loop --------|
          `,
          pageRange: { start: 2, end: 6 }
        },
        {
          id: 'ob-03-t2',
          title: 'Factors Influencing Perception',
          summary: 'Our perception is shaped by three distinct categories: the Perceiver, the Target, and the Situation.',
          details: 'Understanding these factors helps explain why two people can look at the same thing and interpret it differently.',
          comparisonTable: {
            title: 'The Perception Filter Framework',
            headers: ['Factor Category', 'Key Elements', 'Example'],
            rows: [
              ['The Perceiver', 'Attitudes, Motives, Interests, Experience, Expectations', 'An optimistic manager perceives a mistake as a "learning opportunity".'],
              ['The Target', 'Novelty, Motion, Sounds, Size, Background, Proximity', 'A loud employee is noticed more than a quiet, productive one.'],
              ['The Situation', 'Time, Work Setting, Social Setting', 'Wearing a suit at a beach is perceived differently than in a boardroom.']
            ]
          },
          pageRange: { start: 7, end: 11 }
        },
        {
          id: 'ob-03-t3',
          title: 'Attribution Theory',
          summary: 'This theory explains how we judge people differently depending on whether we attribute their behavior to internal or external causes.',
          details: 'Internal attribution implies the person is responsible (e.g., laziness), while External attribution implies the situation is responsible (e.g., bad equipment).',
          asciiDiagram: `
          ATTRIBUTION DETERMINANTS:
          1. DISTINCTIVENESS: High (External) / Low (Internal)
          2. CONSENSUS:      High (External) / Low (Internal)
          3. CONSISTENCY:     High (Internal) / Low (External)
          `,
          definitions: [
            { term: 'Distinctiveness', description: 'Whether an individual displays different behaviors in different situations.' },
            { term: 'Consensus', description: 'If everyone who faces a similar situation responds in the same way.' },
            { term: 'Consistency', description: 'Does the person respond the same way over time?' },
            { term: 'Fundamental Attribution Error', description: 'The tendency to underestimate external factors and overestimate internal factors when judging others.' }
          ],
          pageRange: { start: 12, end: 18 }
        },
        {
          id: 'ob-03-t4',
          title: 'Perceptual Errors',
          summary: 'Managers use these shortcuts to process information quickly, but they often lead to errors in performance appraisals.',
          details: 'Shortcuts allow us to make fast decisions but often result in unfair or inaccurate conclusions about employees.',
          definitions: [
            { term: 'Selective Perception', description: 'Choosing to see only what we want based on our interests and background.' },
            { term: 'Halo Effect', description: 'Drawing a general impression of an individual based on a single characteristic (e.g., intelligence or appearance).' },
            { term: 'Contrast Effects', description: 'Judging a person by comparing them to others recently encountered rather than objective standards.' },
            { term: 'Stereotyping', description: 'Judging someone based on our perception of the group to which they belong.' }
          ],
          pageRange: { start: 19, end: 26 }
        },
        {
          id: 'ob-03-t5',
          title: 'Biases in Decision Making',
          summary: 'Individual decision-making is often irrational due to cognitive biases that cloud judgment.',
          comparisonTable: {
            title: 'Common Decision Biases',
            headers: ['Bias Type', 'Description', 'Real-World Impact'],
            rows: [
              ['Overconfidence Bias', 'Overestimating our abilities.', 'Managers ignore risks in new projects.'],
              ['Anchoring Bias', 'Fixating on initial information.', 'Relying too heavily on the first salary offer mentioned.'],
              ['Confirmation Bias', 'Seeking info that supports our view.', 'Ignoring evidence that a chosen strategy is failing.'],
              ['Escalation of Commitment', 'Staying with a decision despite evidence it is wrong.', 'Pouring money into a failing product line.'],
              ['Availability Bias', 'Basing judgments on memory availability.', 'Appraising an employee based only on their most recent month of work.']
            ]
          },
          pageRange: { start: 27, end: 41 }
        }
      ]
    },//
    {
      id: 'ob-04',
      lessonNumber: 4,
      title: 'Theories of Motivation',
      pdfPath: '/pdfs/ob/ob4.pdf',
      covers: 'Explores Maslow’s Hierarchy, Herzberg’s Two-Factor theory, Reinforcement theory, and Goal-Setting theory.',
      pageRange: { start: 1, end: 20 },
      tags: ['motivation-models', 'behavioral-science', 'goal-setting'],
      resources: [
        { type: 'pdf', label: 'Lesson 4 Notes', path: '/pdfs/ob/ob4.pdf', pageRange: { start: 1, end: 20 } },
      ],
      topics: [
        {
          id: 'ob-04-t1',
          title: 'The Nature of Motivation',
          summary: 'Motivation is the driving force that initiates, guides, and maintains goal-oriented behaviors.',
          details: 'It accounts for why a person does something. In a professional setting, it is the process that accounts for an individual’s intensity (how hard they try), direction (effort toward goals), and persistence (how long they maintain effort).',
          definitions: [
            { term: 'Motivation', description: 'The driving force behind human actions that initiates and maintains goal-oriented behaviors.' }
          ],
          pageRange: { start: 1, end: 3 }
        },
        {
          id: 'ob-04-t2',
          title: "Maslow's Need Hierarchy Theory",
          summary: 'Human needs are arranged in a hierarchy where lower-level survival needs must be satisfied before higher-level creative needs.',
          details: 'As each need is substantially satisfied, the next need becomes dominant. Higher-order needs like self-actualization and esteem are generally satisfied internally, whereas lower-order needs like physiological and safety needs are satisfied externally.',
          asciiDiagram: `
                        /\\
                        /  \\
                      / SA \\           (Self-Actualization: Growth, Potential)
                      /------\\
                    / ESTEEM \\         (Confidence, Achievement, Status)
                    /----------\\
                  /   SOCIAL   \\       (Friendship, Belonging, Intimacy)
                  /--------------\\
                /     SAFETY     \\     (Health, Employment, Security)
                /------------------\\
              /   PHYSIOLOGICAL    \\   (Food, Water, Shelter, Sleep)
              /______________________\\
          `,
          pageRange: { start: 4, end: 6 }
        },
        {
          id: 'ob-04-t3',
          title: "Herzberg's Two-Factor Theory",
          summary: 'Factors that satisfy people (Motivators) are distinct from factors that dissatisfy them (Hygiene factors).',
          details: 'Hygiene factors (Job Context) like salary and work conditions prevent dissatisfaction but do not motivate. Motivators (Job Content) like achievement and recognition are what actually promote job satisfaction and growth.',
          asciiDiagram: `
          +-----------------------------+       +-----------------------------+
          |  HYGIENE FACTORS            |       |  MOTIVATORS                 |
          |  (Prevent Dissatisfaction)  |       |  (Promote Satisfaction)     |
          +-----------------------------+       +-----------------------------+
          | * Company Policy            |       | * Achievement               |
          | * Technical Supervision     |       | * Recognition               |
          | * Salary                    |       | * Work Itself               |
          | * Interpersonal Relations   |       | * Responsibility            |
          | * Working Conditions        |       | * Advancement & Growth      |
          +--------------+--------------+       +--------------+--------------+
                        |                                     |
              [ JOB CONTEXT EXTRINSIC ]             [ JOB CONTENT INTRINSIC ]
          `,
          pageRange: { start: 7, end: 10 }
        },
        {
          id: 'ob-04-t4',
          title: 'Reinforcement Theory of Motivation',
          summary: 'Behavior is driven and shaped by its consequences.',
          details: 'This theory suggests that behaviors followed by positive consequences are likely to be repeated, while behaviors followed by negative consequences are not. It uses reinforcement to increase desired behavior and punishment to reduce undesirable behavior.',
          comparisonTable: {
            title: 'Types of Reinforcement & Consequences',
            headers: ['Method', 'Action', 'Goal'],
            rows: [
              ['Positive Reinforcement', 'Providing rewards (e.g., extra days off)', 'Increase Desired Behavior'],
              ['Negative Reinforcement', 'Removing a negative stimulus (e.g., tedious tasks)', 'Increase Desired Behavior'],
              ['Positive Punishment', 'Delivering an unpleasant stimulus (e.g., criticism)', 'Reduce Undesirable Behavior'],
              ['Negative Punishment', 'Removing a pleasant stimulus (e.g., flexible hours)', 'Reduce Undesirable Behavior'],
              ['Extinction', 'Absence of all reinforcements', 'End Learned Behavior']
            ]
          },
          pageRange: { start: 11, end: 16 }
        },
        {
          id: 'ob-04-t5',
          title: 'Goal-Setting Theory & MBO',
          summary: 'Intentions to work toward specific, difficult goals are a major source of motivation.',
          details: 'Specific goals produce higher output than generalized ones. Management by Objectives (MBO) is a system where specific goals are set participatively, and progress is regularly monitored and rewarded.',
          asciiDiagram: `
              S.M.A.R.T GOAL FRAMEWORK:
              
              [S]pecific     --> Clear and defined
              [M]easurable   --> Trackable progress
              [A]ttainable   --> Skill & resource check
              [R]elevant     --> Importance & alignment
              [T]ime-bound   --> Specific deadline
          `,
          pageRange: { start: 17, end: 20 }
        }
      ]
    },
    {
      id: 'ob-05',
      lessonNumber: 5,
      title: 'Group Theory and Process',
      pdfPath: '/pdfs/ob/ob5.pdf',
      covers: 'Distinction between formal and informal groups, the Five-Stage Model of group development, and concepts in group decision-making such as Groupthink and Groupshift.',
      pageRange: { start: 1, end: 21 },
      tags: ['group-dynamics', 'team-development', 'social-psychology'],
      resources: [
        { type: 'pdf', label: 'Lesson 5 Notes', path: '/pdfs/ob/ob5.pdf', pageRange: { start: 1, end: 21 } },
      ],
      topics: [
        {
          id: 'ob-05-t1',
          title: 'Defining Groups',
          summary: 'A group is defined as two or more individuals, interacting and interdependent, who have come together to achieve particular objectives.',
          details: 'Groups can be classified into two main categories: Formal (defined by the organization) and Informal (formed naturally for social contact).',
          comparisonTable: {
            title: 'Formal vs. Informal Groups',
            headers: ['Feature', 'Formal Groups', 'Informal Groups'],
            rows: [
              ['Definition', 'Defined by organizational structure.', 'Neither formally structured nor determined.'],
              ['Purpose', 'Directed toward organizational goals.', 'Response to the need for social contact.'],
              ['Example', 'Project teams, departments.', 'Lunch groups, workplace friends.']
            ]
          },
          pageRange: { start: 2, end: 2 }
        },
        {
          id: 'ob-05-t2',
          title: 'The Five-Stage Group Development Model',
          summary: 'A framework describing the standard sequence of stages groups pass through as they mature.',
          details: 'Each stage represents a shift in the group’s focus, from establishing a purpose to resolving conflict and ultimately performing tasks effectively.',
          asciiDiagram: `
          STAGES OF GROUP DEVELOPMENT:
          
          [1. FORMING]  --> [2. STORMING] --> [3. NORMING] --> [4. PERFORMING] --> [5. ADJOURNING]
              |                |                |                  |                  |
          Uncertainty      Intragroup       Developing         Fully             Wrapping up
          & Testing        Conflict         Cohesiveness       Functional        activities
          `,
          definitions: [
            { term: 'Forming', description: 'Characterized by uncertainty about purpose and leadership; members "test the waters".' },
            { term: 'Storming', description: 'A stage of intragroup conflict where members resist constraints on individuality.' },
            { term: 'Norming', description: 'Close relationships develop and the group demonstrates cohesiveness.' },
            { term: 'Performing', description: 'The structure is fully functional and accepted; energy moves to task performance.' },
            { term: 'Adjourning', description: 'Preparation for disbanding; focus is on wrapping up rather than performance.' }
          ],
          pageRange: { start: 3, end: 5 }
        },
        {
          id: 'ob-05-t3',
          title: 'Group Properties: Roles, Norms, & Status',
          summary: 'Groups are shaped by internal properties that define member behavior.',
          details: 'Roles define expected behavior patterns, while norms are acceptable standards of behavior shared by members.',
          definitions: [
            { term: 'Roles', description: 'A set of expected behavior patterns attributed to someone occupying a given position.' },
            { term: 'Norms', description: 'Acceptable standards of behavior within a group that are shared by the members.' },
            { term: 'Status', description: 'A socially defined position or rank given to groups or group members by others.' },
            { term: 'Cohesiveness', description: 'The degree to which members are attracted to each other and motivated to stay in the group.' }
          ],
          pageRange: { start: 6, end: 12 }
        },
        {
          id: 'ob-05-t4',
          title: 'Group Decision-Making Concepts',
          summary: 'Group interaction can lead to specific psychological phenomena that impact decision quality.',
          details: 'Two major risks in group decision-making are Groupthink (pressure to conform) and Groupshift (moving toward extreme positions).',
          comparisonTable: {
            title: 'Groupthink vs. Groupshift',
            headers: ['Concept', 'Description', 'Consequence'],
            rows: [
              ['Groupthink', 'Norms for conformity override realistic appraisal of alternative views.', 'Hinders performance; unusual/minority views are suppressed.'],
              ['Groupshift', 'Members shift toward a more extreme version of their initial position.', 'Decision becomes significantly riskier or more cautious than intended.']
            ]
          },
          pageRange: { start: 18, end: 19 }
        },
      ]
    },//
    {
      id: 'ob-06',
      lessonNumber: 6,
      title: 'Understanding Work Teams',
      pdfPath: '/pdfs/ob/ob6.pdf',
      covers: 'Distinguishes between work groups and work teams, identifies four types of teams, and explores the Team Effectiveness Model (Context, Composition, and Process).',
      pageRange: { start: 1, end: 23 },
      tags: ['teamwork', 'organizational-efficiency', 'team-building'],
      resources: [
        { type: 'pdf', label: 'Lesson 6 Notes', path: '/pdfs/ob/ob6.pdf', pageRange: { start: 1, end: 23 } },
      ],
      topics: [
        {
          id: 'ob-06-t1',
          title: 'Comparing Work Groups and Work Teams',
          summary: 'While often used interchangeably, groups and teams differ significantly in their goals, synergy, and accountability.',
          details: 'A work group interacts primarily to share information to help each member perform within their area of responsibility. A work team, however, generates positive synergy through coordinated effort.',
          asciiDiagram: `
          WORK GROUPS                      WORK TEAMS
          +-------------------------+      +-------------------------+
          | Goal: Share Info        |      | Goal: Collective Perf.  |
          | Synergy: Neutral        |  vs  | Synergy: Positive       |
          | Accountability: Indiv.   |      | Accountability: Mutual  |
          | Skills: Random/Varied   |      | Skills: Complementary   |
          +-------------------------+      +-------------------------+
          `,
          pageRange: { start: 6, end: 7 }
        },
        {
          id: 'ob-06-t2',
          title: 'Types of Teams',
          summary: 'Organizations use different team structures depending on the task and degree of autonomy required.',
          details: 'The four most common types of teams are:',
          definitions: [
            { term: 'Problem-Solving Teams', description: '5 to 12 employees from the same department who meet for a few hours each week to discuss ways of improving quality and efficiency.' },
            { term: 'Self-Managed Work Teams', description: 'Groups of employees (10 to 15) who take on responsibilities of their former supervisors, such as planning and scheduling work.' },
            { term: 'Cross-Functional Teams', description: 'Employees from about the same hierarchical level, but from different work areas, who come together to accomplish a task (e.g., Task Forces).' },
            { term: 'Virtual Teams', description: 'Teams that use computer technology to tie together physically dispersed members in order to achieve a common goal.' }
          ],
          pageRange: { start: 8, end: 14 }
        },
        {
          id: 'ob-06-t3',
          title: 'Team Effectiveness Model: Context',
          summary: 'The context of a team significantly influences whether it succeeds or fails.',
          details: 'Effective teams require adequate resources, leadership, a climate of trust, and a performance evaluation system that reflects team contributions.',
          comparisonTable: {
            title: 'Contextual Factors',
            headers: ['Factor', 'Requirement for Effectiveness'],
            rows: [
              ['Adequate Resources', 'Support from the organization (tools, info, staffing).'],
              ['Leadership & Structure', 'Agreement on who is to do what and how they fit together.'],
              ['Climate of Trust', 'Members must trust each other and their leaders.'],
              ['Reward Systems', 'Hybrid systems that reward both individual and group effort.']
            ]
          },
          pageRange: { start: 16, end: 19 }
        },
        {
          id: 'ob-06-t4',
          title: 'Team Effectiveness Model: Composition',
          summary: 'This relates to how teams should be staffed.',
          details: 'Key variables include the abilities and personality of members, allocation of roles, diversity, and size of the team.',
          asciiDiagram: `
          TEAM COMPOSITION CHECKLIST:
          [ ] Abilities of Members (KSAs)
          [ ] Personality (Open/Conscientious)
          [ ] Allocation of Roles
          [ ] Diversity (Multiple Perspectives)
          [ ] Size (Ideally 5-9 members)
          [ ] Member Preferences (Are they team players?)
          `,
          pageRange: { start: 21, end: 22 }
        },
        {
          id: 'ob-06-t5',
          title: 'Team Processes',
          summary: 'Processes are the "internal " actions that convert inputs into outcomes.',
          details: 'Effective teams show commitment to a common purpose, set specific goals, maintain team efficacy (belief in success), and minimize social loafing.',
          definitions: [
            { term: 'Common Purpose', description: 'A meaningful vision that provides direction and momentum.' },
            { term: 'Team Efficacy', description: 'The collective belief among team members that they can succeed at their tasks.' },
            { term: 'Social Loafing', description: 'The tendency for individuals to expend less effort when working collectively than when working individually.' }
          ],
          pageRange: { start: 23, end: 23 }
        }
      ]
    },//
    {
      id: 'ob-07',
      lessonNumber: 7,
      title: 'Leadership',
      pdfPath: '/pdfs/ob/ob7.pdf',
      covers: 'Defines leadership, explores Trait and Behavioral theories (Ohio State, Managerial Grid), and analyzes nine specific leadership styles.',
      pageRange: { start: 1, end: 20 },
      tags: ['leadership-theories', 'managerial-grid', 'trait-theory', 'behavioral-leadership'],
      resources: [
        { type: 'pdf', label: 'Lesson 7 Notes', path: '/pdfs/ob/ob7.pdf', pageRange: { start: 1, end: 20 } },
      ],
      topics: [
        {
          id: 'ob-07-t1',
          title: 'Defining Leadership',
          summary: 'Leadership is the art of motivating a group to achieve a common goal through influence and potential maximization.',
          details: 'It involves empowering people, leading change, sharing a vision, and inspiring others. While management focuses on coping with complexity through planning and organizing, leadership focuses on coping with change by establishing direction.',
          pageRange: { start: 2, end: 7 }
        },
        {
          id: 'ob-07-t2',
          title: 'Theory of Leadership: Trait',
          summary: 'Focuses on the personal qualities and characteristics that differentiate leaders from non-leaders.',
          comparisonTable: {
            title: 'Prominent Leadership Traits',
            headers: ['Trait', 'Description'],
            rows: [
              ['Intelligence', 'Ability to think, analyze problems, and make good decisions.'],
              ['Self-confidence', 'Belief in one’s own abilities and judgments.'],
              ['Integrity', 'Honesty and strong moral principles.'],
              ['Determination', 'Persistence and drive to achieve goals.'],
              ['Sociability', 'Ability to interact well and build relationships with others.'],
              ['Emotional Stability', 'Ability to remain calm and composed under pressure.']
            ]
          },
          pageRange: { start: 8, end: 9 }
        },
        {
          id: 'ob-07-t3',
          title: 'The Leadership (Managerial) Grid',
          summary: 'A 9x9 matrix used to classify leadership styles based on concern for people versus concern for production.',
          asciiDiagram: `
          CONCERN FOR PEOPLE (1-9 Scale)
          ^
          9 | (1,9) Country Club      (9,9) Team Leadership
            | (High People/Low Work)   (High People/High Work)
            |
          5 |          (5,5) Middle-of-the-Road
            |          (Moderate People/Work)
            |
          1 | (1,1) Impoverished      (9,1) Task Management
            | (Low People/Low Work)    (Low People/High Work)
            +---------------------------------------------->
              1                      5                      9
                    CONCERN FOR PRODUCTION (1-9 Scale)
          `,
          comparisonTable: {
            title: 'Managerial Grid Styles',
            headers: ['Style', 'Grid Coordinates', 'Focus'],
            rows: [
              ['Impoverished Management', '1,1', 'Minimum effort to sustain membership.'],
              ['Task Management', '9,1', 'Efficiency through operational control.'],
              ['Country Club Management', '1,9', 'High attention to people needs and relationships.'],
              ['Middle-of-the-Road', '5,5', 'Balancing work necessity with morale.'],
              ['Team Management', '9,9', 'Interdependence through a "common stake" in purpose.']
            ]
          },
          pageRange: { start: 12, end: 15 }
        },
        {
          id: 'ob-07-t5',
          title: 'Nine Styles of Leadership',
          summary: 'Specific behavioral patterns used by leaders to influence followers.',
          definitions: [
            { term: 'Autocratic', description: 'Leader makes decisions alone and expects strict compliance (e.g., Steve Jobs).' },
            { term: 'Participative (Democratic)', description: 'Involves employees in decision-making to value their input.' },
            { term: 'Laissez-faire', description: 'Leader provides minimal direction; allows independent work.' },
            { term: 'Charismatic', description: 'Inspires followers through personal charm and confidence.' },
            { term: 'Transactional', description: 'Based on rewards and punishments for routine performance.' },
            { term: 'Transformational', description: 'Motivates followers by creating a shared vision (e.g., Satya Nadella).' },
            { term: 'Servant', description: 'Prioritizes follower growth over personal power (e.g., Herb Kelleher).' },
            { term: 'Bureaucratic', description: 'Strictly follows rules, procedures, and formal authority.' },
            { term: 'Expert', description: 'Influence derived from specialized knowledge (e.g., Sundar Pichai).' }
          ],
          pageRange: { start: 16, end: 19 }
        }
      ]
    },
    {
      id: 'ob-08',
      lessonNumber: 8,
      title: 'Power and Politics',
      pdfPath: '/pdfs/ob/ob8.pdf',
      covers: 'Definitions of power, authority, and influence; sources of formal and personal power; the role of dependency; and impression management techniques.',
      pageRange: { start: 1, end: 21 },
      tags: ['organizational-power', 'politics', 'influence-tactics', 'impression-management'],
      resources: [
        { type: 'pdf', label: 'Lesson 8 Notes', path: '/pdfs/ob/ob8.pdf', pageRange: { start: 1, end: 21 } },
      ],
      topics: [
        {
          id: 'ob-08-t1',
          title: 'Power & Dependency',
          summary: 'Power is essentially a function of dependency.',
          details: 'Power is the broad capacity to make others act.\n\n• The more person B depends on person A, the more power A has over B. This dependency is created when A possesses something that B requires, such as resources or information.',
          pageRange: { start: 4, end: 4 }
        },
        {
          id: 'ob-08-t2',
          title: 'Sources of Power: Formal vs. Personal',
          summary: 'Power stems either from one’s position in an organization or from unique personal characteristics.',
          details: 'Personal power is often more effective than formal power because it relies on unique traits and knowledge that others respect.',
          comparisonTable: {
            title: 'Types of Organizational Power',
            headers: ['Category', 'Type', 'Source/Description'],
            rows: [
              ['Formal Power', 'Reward Power', 'Ability to control rewards that the target wants.'],
              ['Formal Power', 'Coercive Power', 'Ability to cause an unpleasant experience if target fails to comply.'],
              ['Formal Power', 'Legitimate Power', 'Power based on structural position/hierarchy.'],
              ['Personal Power', 'Expert Power', 'Influence based on special skills or knowledge.'],
              ['Personal Power', 'Referent Power', 'Influence based on identification with a person who has desirable resources or traits.']
            ]
          },
          pageRange: { start: 5, end: 9 }
        },
        {
          id: 'ob-08-t3',
          title: 'Organizational Politics',
          summary: 'Activities that are not required as part of a formal role but influence the distribution of advantages.',
          details: 'Politics occur when employees convert their power into action. Factors contributing to political behavior include individual traits (high self-monitor) and organizational factors (declining resources, low trust).',
          definitions: [
            { term: 'Political Behavior', description: 'Activities not required as part of a formal role that influence the distribution of advantages and disadvantages within the organization.' },
            { term: 'Defensive Behaviors', description: 'Reactive and protective behaviors to avoid action, blame, or change (e.g., "playing safe" or "buffing").' }
          ],
          pageRange: { start: 10, end: 17 }
        },
        {
          id: 'ob-08-t4',
          title: 'Impression Management (IM)',
          summary: 'The process by which individuals attempt to control the impression others form of them.',
          details: 'IM techniques are frequently used in job interviews and performance appraisals to project a certain image.',
          comparisonTable: {
            title: 'Common IM Techniques',
            headers: ['Technique', 'Description', 'Example'],
            rows: [
              ['Conformity', 'Agreeing with someone to gain approval.', 'Agreeing with a boss’s opinion even if you disagree.'],
              ['Favors', 'Doing something nice to gain favor.', 'Helping a colleague with a difficult task.'],
              ['Excuses', 'Explaining a poor event to minimize severity.', 'Explaining why a deadline was missed due to external factors.'],
              ['Apologies', 'Admitting responsibility and seeking a pardon.', '"I am sorry I made a mistake on the report."'],
              ['Self-Promotion', 'Highlighting best qualities/achievements.', '"I am the best closer this company has."'],
              ['Flattery', 'Complimenting others to appear likeable.', '"You handled that complaint so tactfully!"'],
              ['Exemplification', 'Doing more than needed to show dedication.', 'Sending emails late at night to show long hours.']
            ]
          },
          pageRange: { start: 18, end: 21 }
        }
      ]
    },
    {
      id: 'ob-09',
      lessonNumber: 9,
      title: 'Conflict & Negotiation',
      pdfPath: '/pdfs/ob/ob9.pdf',
      covers: 'Comprehensive breakdown of conflict types (Nature vs. Impact), the evolution of conflict thought, the detailed five-stage conflict process, and negotiation strategies.',
      pageRange: { start: 1, end: 33 },
      tags: ['conflict-management', 'negotiation', 'BATNA', 'functional-conflict'],
      resources: [
        { type: 'pdf', label: 'Lesson 9 Notes', path: '/pdfs/ob/ob9.pdf', pageRange: { start: 1, end: 33 } },
      ],
      topics: [
        {
          id: 'ob-09-t1',
          title: 'Types of Conflict: Nature and Impact',
          summary: 'Conflict is classified by its source (Nature) and its outcome on organizational performance (Impact).',
          details: 'Disagreements can arise within oneself, between people, or regarding the work itself. Whether these conflicts help or hurt the organization depends on their functionality.',
          comparisonTable: {
            title: 'Classification by Nature (Sources)',
            headers: ['Type', 'Definition', 'Example'],
            rows: [
              ['Task Conflict', 'Disagreement over work goals or content.', 'Debating whether to use online or traditional marketing.'],
              ['Process Conflict', 'Disagreement over how work gets done.', 'Arguing about who handles data analysis vs. presentations.'],
              ['Relationship Conflict', 'Interpersonal tensions and personality clashes.', 'Two members arguing because they dislike each others attitudes.'],
              ['Intrapersonal Conflict', 'Internal struggle within a single person.', 'A manager choosing between family time and a promotion.'],
              ['Interpersonal Conflict', 'Conflict between two or more individuals.', 'Conflict between a supervisor and a subordinate over a deadline.']
            ]
          },
          definitions: [
            { term: 'Functional Conflict', description: 'Supports the goals of the group and improves its performance (e.g., healthy debate over a project plan).' },
            { term: 'Dysfunctional Conflict', description: 'Hinders group performance and is usually destructive (e.g., personal attacks during a meeting).' }
          ],
          pageRange: { start: 4, end: 11 }
        },
        {
          id: 'ob-09-t2',
          title: 'Process of Conflict',
          summary: 'Combines the transitions in conflict thought with the five-stage process that conflict follows.',
          details: 'Conflict thought has moved from Traditional (avoid it) to Human Relations (accept it) to Interactionist (encourage it). The process itself follows five distinct stages:',
          asciiDiagram: `
          THE CONFLICT PROCESS FLOW:
          
          STAGE I: Potential Opposition (Communication, Structure, Variables)
                    |
          STAGE II: Cognition & Personalization (Perceived vs. Felt)
                    |
          STAGE III: Intentions (Competing, Collaborating, Avoiding, etc.)
                    |
          STAGE IV: Behavior (Party's behavior & Others' reactions)
                    |
          STAGE V: Outcomes (Increased or Decreased performance)
          `,
          comparisonTable: {
            title: 'The Five Stages of Conflict',
            headers: ['Stage', 'Sub-topics', 'Description/Example'],
            rows: [
              ['I: Potential Opposition', 'Communication, Structure', 'Lack of info or rigid hierarchy creates the "spark".'],
              ['II: Cognition', 'Perceived vs. Felt', 'When the conflict is recognized and felt emotionally (stress/anxiety).'],
              ['III: Intentions', 'Handling Styles', 'Deciding whether to compete, collaborate, or avoid.'],
              ['IV: Behavior', 'Dynamic Interaction', 'The actual statements and actions made during the disagreement.'],
              ['V: Outcomes', 'Functional/Dysfunctional', 'Functional: Better decisions. Dysfunctional: Group dissolution.']
            ]
          },
          pageRange: { start: 12, end: 20 }
        },
        {
          id: 'ob-09-t3',
          title: 'Negotiation Strategies & The "Fixed Pie"',
          summary: 'Bargaining strategies used to resolve conflict.',
          details: 'Negotiation is a process in which two or more parties exchange goods or services and attempt to agree on the exchange rate for them.',
          comparisonTable: {
            title: 'Distributive vs. Integrative Bargaining',
            headers: ['Characteristic', 'Distributive', 'Integrative'],
            rows: [
              ['Goal', 'Get as much of the pie as possible.', 'Expand the pie so both win.'],
              ['Motivation', 'Win-Lose', 'Win-Win'],
              ['Focus', 'Positions ("I want this")', 'Interests ("Why I want this")'],
              ['Information Sharing', 'Low (Hide info)', 'High (Share info to find solutions)']
            ]
          },
          pageRange: { start: 22, end: 25 }
        },
        {
          id: 'ob-09-t4',
          title: 'The Negotiation Process & BATNA',
          summary: 'The five-step procedure for reaching an agreement.',
          details: 'Preparation is the most critical stage. You must determine your BATNA to know your "walk-away" point.',
          asciiDiagram: `
          STAGES OF NEGOTIATION:
          
          [1. PREPARATION] -> [2. GROUND RULES] -> [3. CLARIFICATION]
                |                   |                    |
          Determine BATNA     Who/Where/When       Justify Demands
                                                          |
                                        +-----------------+
                                        v
                              [4. BARGAINING] ----> [5. CLOSURE]
                                (Give-and-take)     (Formalize Agreement)
          `,
          definitions: [
            { term: 'BATNA', description: 'Best Alternative To a Negotiated Agreement; the lowest value acceptable to you for a negotiated agreement.' }
          ],
          pageRange: { start: 27, end: 31 }
        }
      ]
    },
    {
      id: 'ob-10',
      lessonNumber: 10,
      title: 'Organizational Structure',
      pdfPath: '/pdfs/ob/ob10.pdf',
      covers: 'Comprehensive analysis of organizational design, covering Simple, Bureaucracy, Matrix, and Boundaryless structures with their respective strengths, weaknesses, and real-world applications.',
      pageRange: { start: 1, end: 9 },
      tags: ['organizational-design', 'bureaucracy', 'matrix-management', 'boundaryless-org'],
      resources: [
        { type: 'pdf', label: 'Lesson 10 Notes', path: '/pdfs/ob/ob10.pdf', pageRange: { start: 1, end: 9 } },
      ],
      topics: [
        {
          id: 'ob-10-t1',
          title: 'Defining Organizational Structure',
          summary: 'The basic framework that shows how work and responsibilities are arranged in an organization.',
          details: 'Organizational structure explains who does what, who reports to whom, how tasks are divided, and how employees work together to achieve company goals. It acts like a blueprint for managing the organization.',
          pageRange: { start: 2, end: 2 }
        },
        {
          id: 'ob-10-t2',
          title: '1. The Simple Structure',
          summary: 'A centralized and flexible design typically found in small businesses.',
          details: 'In a simple structure, one person (usually the owner) controls most decisions, there are very few rules, and employees directly report to the owner. This structure is fast and flexible because decision-making is simple.',
          comparisonTable: {
            title: 'Simple Structure Analysis',
            headers: ['Feature', 'Details'],
            rows: [
              ['Definition', 'A basic design where the manager and owner are often the same person.'],
              ['Advantages', 'Fast, flexible, inexpensive to maintain, and clear accountability.'],
              ['Disadvantages', 'Inadequate as the company grows; high risk as everything depends on one person.'],
              ['Example', 'A small retail store or a startup where the founder makes all key decisions.']
            ]
          },
          pageRange: { start: 3, end: 3 }
        },
        {
          id: 'ob-10-t3',
          title: '2. The Bureaucracy',
          summary: 'A structure based on strict rules and specialization.',
          details: 'In bureaucracy, employees follow fixed rules and procedures, work is divided into departments, and authority follows a strict hierarchy. Everything is standardized to maintain order and efficiency.',
          comparisonTable: {
            title: 'Bureaucracy Analysis',
            headers: ['Pros (Advantages)', 'Cons (Disadvantages)'],
            rows: [
              ['Clear rules', 'Too many rules'],
              ['High efficiency.', 'Less innovation and slow to change.'],
              ['Less confusion and Standard quality of work.', 'Difficult to adapt to change.']
              
            ]
          },
          pageRange: { start: 4, end: 4 }
        },
        {
          id: 'ob-10-t4',
          title: '3. The Matrix Structure',
          summary: 'A structure where employees report to two managers.',
          details: 'In a matrix structure, employees work under both a functional manager and a project manager, which improves coordination between departments. This helps companies handle complex projects better.',
          asciiDiagram: `
          THE MATRIX GRID:
          +-------------+-------------+-------------+
          |             | Engineering | Manufacturing|
          +-------------+-------------+-------------+
          | Project A   |  Employee 1 |  Employee 2 | <--- Reports to both
          +-------------+-------------+-------------+
          | Project B   |  Employee 3 |  Employee 4 |      Managers
          +-------------+-------------+-------------+
          `,
          comparisonTable: {
            title: 'Matrix Structure Analysis',
            headers: ['Advantages', 'Disadvantages'],
            rows: [
              ['Better teamwork.', 'Confusion due to two bosses.'],
              ['Efficient use of specialists.', 'Stress and conflicts.'],
              ['Improved communication.', 'Power struggles between managers.']
            ]
          },
          pageRange: { start: 5, end: 6 }
        },
        {
          id: 'ob-10-t5',
          title: '4. The Boundaryless Organization',
          summary: 'A contemporary design that eliminates internal and external barriers.',
          details: 'This structure reduces strict hierarchy, department barriers, and separation between the company and outside partners. Employees work more freely in teams.',
          comparisonTable: {
            title: 'Breaking Organizational Boundaries',
            headers: ['Boundary', 'Impact of Removal'],
            rows: [
              ['Vertical', 'Removing them makes communication and decision-making faster.'],
              ['Horizontal', 'Improves teamwork between departments.'],
              ['External', 'Creates better cooperation with customers and suppliers.'],
              ['Geographical Boundaries', 'helps people from different locations work together easily.'],
              ['Example', 'GE (under Jack Welch) or Meesho’s Project-Oriented Development.']
            ]
          },
          pageRange: { start: 7, end: 8 }
        }
      ]
    },
    {
      id: 'ob-11',
      lessonNumber: 11,
      title: 'Organizational Culture',
      pdfPath: '/pdfs/ob/ob11.pdf',
      covers: 'Detailed analysis of how culture is created, the three stages of socialization, and the elements through which employees learn and internalize values.',
      pageRange: { start: 1, end: 18 },
      tags: ['corporate-culture', 'socialization', 'organizational-values', 'founders-influence'],
      resources: [
        { type: 'pdf', label: 'Lesson 11 Notes', path: '/pdfs/ob/ob11.pdf', pageRange: { start: 1, end: 18 } },
      ],
      topics: [
        {
          id: 'ob-11-t1',
          title: 'Creating and Sustaining Culture',
          summary: 'The lifecycle of culture from its founder-led origins to its organizational maintenance.',
          details: 'Organizational culture begins with the founders, who hire and keep employees who share their vision. It is sustained through three key pillars: Selection (hiring for "fit"), Top Management (executives who set behavioral norms), and Socialization (adapting new hires).',
          asciiDiagram: `
          HOW ORGANIZATION CULTURE FORMS:
          
          [1. PHILOSOPHY OF FOUNDERS] 
                    |
                    v
          [2. SELECTION CRITERIA] 
                    |                        
          +---------+---------+              
          |                   |               
          v                   v                
          [TOP MANAGEMENT]  [SOCIALIZATION]  
          (Senior Execs     (Adaptation      
          set Norms)        Process)        
                    |         |              
                    +---------+
                          |
                          v
                  [ORGANIZATIONAL CULTURE]
          `,
          definitions: [
            { term: 'How Culture Begins', description: 'Founders only hire employees who think and feel the way they do. They indoctrinate these employees into their way of thinking, and the founders own behavior acts as a role model.' },
            { term: 'Selection', description: 'The explicit goal is to identify and hire individuals who have the knowledge, skills, and abilities to perform successfully and who "fit" the organization.' },
            { term: 'Top Management', description: 'Senior executives establish norms that filter down through the organization (e.g., is risk-taking desirable? how much freedom should managers give?).' }
          ],
          pageRange: { start: 1, end: 10 }
        },
        {
          id: 'ob-11-t2',
          title: 'Stages in the Socialization Process',
          summary: 'The process of helping new employees adapt to the organization\'s culture.',
          details: 'Socialization is essential for maintaining culture. It ensures that newcomers do not disrupt the established beliefs and values of the existing team.',
          asciiDiagram: `
          SOCIALIZATION MODEL:
          
          [ PRE-ARRIVAL ] ----> [ ENCOUNTER ] ----> [ METAMORPHOSIS ]
                |                    |                     |
          (Learning that      (Confronting the      (Changing and
          occurs before       reality vs.           adjusting to 
          joining)            expectations)         the work group)
                |                    |                     |
                +--------------------+---------------------+
                                      |
                                      v
                    [ OUTCOMES: Productivity & Commitment ]
          `,
          definitions: [
            { term: 'Pre-arrival Stage', description: 'The learning that occurs before a new member joins. It acknowledges that everyone arrives with a set of values and expectations.' },
            { term: 'Encounter Stage', description: 'The member sees what the organization is really like. If expectations were high/unrealistic, this stage often requires a major readjustment.' },
            { term: 'Metamorphosis Stage', description: 'The stage where the new employee masters the skills required for their job, successfully performs their new roles, and makes adjustments.' }
          ],
          pageRange: { start: 11, end: 12 }
        },
        {
          id: 'ob-11-t3',
          title: 'How Employees Learn Culture',
          summary: 'Transmission of values through stories, rituals, symbols, and language.',
          details: 'Employees learn culture through several key elements that act as "culture carriers," reinforcing the shared beliefs established during the formation process.',
          comparisonTable: {
            title: 'Elements of Cultural Learning',
            headers: ['Element', 'Meaning/Definition', 'Examples from Text'],
            rows: [
              ['Stories', 'Narratives that anchor the present in the past.', 'Founders’ stories or reactions to past mistakes.'],
              ['Rituals', 'Repetitive activities that express core values.', 'Birthday celebrations, team outings, fun games.'],
              ['Material Symbols', 'Physical signs of culture and hierarchy.', 'Office layouts, dress codes, perks, or "Silent Rooms".'],
              ['Language', 'Unique terms or jargon to identify members.', 'Acronyms and slang unique to the company.']
            ]
          },
          asciiDiagram: `
          HOW ORGANIZATIONAL CULTURES FORM (Final Flow):
          
          (Philosophy) -> (Selection) -> (Top Mgmt) -> (Socialization)
              ^                                              |
              |______________________________________________|
                            (Result: Internalized Culture)
          `,
          pageRange: { start: 13, end: 17 }
        }
      ]
    },
  ],
}