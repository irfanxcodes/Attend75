export const CCFA_SUBJECT = {
  id: 'ccfa',
  title: 'Cloud Computing Foundation and Applications',
  description: 'Theory-focused StudyMe roadmap covering cloud concepts, architecture, storage, security, and virtualization.',
  contentType: 'theory',
  pdfPath: '/pdfs/ccfa/ccfa_main.pdf',
  importantRevision: {
    theory: [
      {
        title: 'Cloud Basics and Fundamentals',
        points: [
          'Cloud Computing and Server along with examples',
          'Evolution of Cloud Computing & Cloud Enablers',
          'Characteristics of Cloud Computing',
          'Benefits and Challenges of Cloud Computing',
        ],
      },
      {
        title: 'Cloud Models and Comparisons',
        points: [
          'Cloud Deployment models (Public, Private, Hybrid, Community)',
          'Cloud Service Delivery Models (IaaS, PaaS, SaaS) with Characteristics',
          'Compare Traditional Computing and Cloud Computing',
        ],
      },
      {
        title: 'Cloud Providers and Platforms',
        points: [
          'Major Cloud Service Providers (AWS, Azure, GCP) with examples',
          'Key AWS Services and GCP Management Services',
          'Enterprise Platforms: Salesforce.com, OpenStack, Rackspace, VMware',
        ],
      },
      {
        title: 'Cloud Architecture and Frameworks',
        points: [
          'NIST Reference Architecture: 5 Components and Actors',
          'IBM Cloud Reference Architecture: Main Actors',
          'Architecture Hierarchy: Model, Architecture, Framework',
          'Microsoft Cloud Platform & CISCO Cloud Framework Layers',
        ],
      },
      {
        title: 'Cloud Storage and Data Systems',
        points: [
          'Advantages and Limitations of Cloud Storage',
          'Storage Models: Management-based vs. Deployment-based',
          'Google Cloud Storage, Google File System (GFS), and Bigtable',
        ],
      },
      {
        title: 'Virtualization Concepts',
        points: [
          'Need for Virtualization and its Limitations',
          'Types: Server, Client, Desktop, Resource, and Process Virtualization',
          'Full Virtualization vs. Para-Virtualization vs. OS Level',
          'Traditional Approach vs. Virtualization Approach',
        ],
      },
      {
        title: 'Cloud Security',
        points: [
          'NIST/CSA Security Reference Architecture',
          'The Nine Notorious Threats (CSA) and NIST Identified Issues',
          'Gartner Security Risks for Cloud Computing',
        ],
      },
    ],
    application: [
      {
        title: 'Hospital Internal System on Cloud',
        scenario:
          'A hospital wants to deploy its internal patient processing system on the cloud.',
        answer:
          'Private cloud is recommended. IaaS or SaaS can be used depending on whether the hospital wants full control or a ready-made healthcare application.',
        why:
          'Hospitals handle sensitive patient data, so security, privacy, compliance, and controlled access are important.',
        examPoints: [
          'Recommend private cloud for sensitive medical data.',
          'Mention security, privacy, and compliance.',
          'Use IaaS if custom control is needed; SaaS if ready-made software is enough.',
        ],
      },
      {
        title: 'Insurance Policy and Claims System',
        scenario:
          'An insurance company wants to deploy its internal policy management and claims processing system on the cloud.',
        answer:
          'Private or hybrid cloud is suitable. IaaS/PaaS may be used depending on whether the company wants infrastructure control or faster application development.',
        why:
          'Insurance systems contain sensitive customer and claim data, but may also need scalability for online services.',
        examPoints: [
          'Mention data sensitivity and compliance.',
          'Private cloud gives control; hybrid adds scalability.',
          'PaaS supports faster development of claim-processing applications.',
        ],
      },
      {
        title: 'Bank Secure Transaction System',
        scenario:
          'A bank requires secure transactions, full control over data, and custom applications.',
        answer:
          'Private cloud with IaaS is the most suitable choice.',
        why:
          'Private cloud gives control and security, while IaaS gives control over operating systems, security settings, and custom banking software.',
        examPoints: [
          'Private cloud = control and security.',
          'IaaS = control over infrastructure and OS.',
          'Mention compliance and transaction security.',
        ],
      },
      {
        title: 'Cloud Carrier Role',
        scenario:
          'An Internet Service Provider provides internet connectivity between cloud users and cloud providers.',
        answer:
          'The actor is the Cloud Carrier.',
        why:
          'A cloud carrier provides network connectivity and transport services between the cloud consumer and cloud provider.',
        examPoints: [
          'Identify the actor as Cloud Carrier.',
          'Mention connectivity between consumer and provider.',
          'Use NIST cloud actor terminology.',
        ],
      },
      {
        title: 'Educational Institution Cloud Setup',
        scenario:
          'A college wants online classes, email services, and shared documents.',
        answer:
          'Public cloud with SaaS is usually suitable.',
        why:
          'The college can use ready-made services like email, online classroom tools, and document sharing without managing infrastructure.',
        examPoints: [
          'Public cloud is cost-effective and accessible.',
          'SaaS provides ready-to-use applications.',
          'Examples: Google Workspace, Microsoft 365, online classroom platforms.',
        ],
      },
      {
        title: 'Server Underutilization in University',
        scenario:
          'A university has 15 physical servers, each running one application, and many servers are underutilized.',
        answer:
          'Server virtualization should be used.',
        why:
          'Virtualization allows multiple virtual machines to run on the same physical server, improving hardware utilization and reducing cost.',
        examPoints: [
          'Mention server consolidation.',
          'Explain better resource utilization.',
          'State cost reduction through fewer physical servers.',
        ],
      },
      {
        title: 'Lab Software Without Installation',
        scenario:
          'A college wants students to use lab software without installing it on their personal computers.',
        answer:
          'Desktop virtualization or application virtualization is suitable.',
        why:
          'Students can access software remotely while installation and management remain centralized.',
        examPoints: [
          'Mention remote access to lab software.',
          'Centralized management reduces setup effort.',
          'Useful for BYOD/student laptops.',
        ],
      },
      {
        title: 'Shared Hospital Cloud Infrastructure',
        scenario:
          'Multiple hospitals share common cloud infrastructure and require secure communication and monitoring.',
        answer:
          'Community cloud is suitable, with strong security monitoring and cloud security architecture.',
        why:
          'Community cloud supports organizations with shared requirements, such as healthcare compliance and secure collaboration.',
        examPoints: [
          'Community cloud fits shared industry needs.',
          'Mention secure communication and monitoring.',
          'Relate to healthcare compliance.',
        ],
      },
      {
        title: 'E-Commerce Web Application',
        scenario:
          'An e-commerce company wants to host a web application with auto scaling, low cost, and global access.',
        answer:
          'Use public cloud services from AWS, Azure, or GCP.',
        why:
          'Public cloud platforms provide scalable compute, storage, CDN, databases, and load balancing for global applications.',
        examPoints: [
          'AWS examples: EC2, S3, RDS, Auto Scaling, CloudFront.',
          'Azure examples: App Service, Virtual Machines, Blob Storage, Azure SQL.',
          'GCP examples: Compute Engine, Cloud Storage, Cloud SQL, Cloud Load Balancing.',
        ],
      },
      {
        title: 'Bank Internal Transaction System',
        scenario:
          'A bank wants to deploy its internal transaction processing system on the cloud.',
        answer:
          'Private cloud with IaaS is recommended.',
        why:
          'Banking transactions require strong security, control, compliance, and custom configuration.',
        examPoints: [
          'Private cloud protects sensitive financial data.',
          'IaaS allows control over infrastructure and security.',
          'Mention compliance, monitoring, and secure access.',
        ],
      },
    ],
    caseStudies: [
      {
        name: 'Kellogg – SAP HANA on AWS',
        context:
          'Kellogg implemented SAP HANA on AWS to improve enterprise data processing, scalability, and performance.',
        keyConcepts: [
          'AWS cloud infrastructure',
          'SAP HANA',
          'Scalability',
          'Cloud deployment architecture',
        ],
        application:
          'AWS provides scalable compute and storage for SAP HANA, enabling faster analytics and reducing dependency on on-premise infrastructure.',
        takeaways: [
          'Link AWS with enterprise scalability and performance.',
          'Explain SAP HANA as a high-speed data processing platform.',
          'Highlight reduced infrastructure cost and flexibility.',
        ],
      },
      {
        name: 'Cloud in Public Sector – Educational Institution',
        context:
          'An educational institution uses cloud services to provide online classes, email, and shared resources for students and faculty.',
        keyConcepts: [
          'SaaS',
          'Public cloud',
          'Collaboration tools',
          'Scalability',
        ],
        application:
          'Cloud platforms like Google Workspace or Microsoft 365 allow institutions to deliver services without managing infrastructure.',
        takeaways: [
          'Mention SaaS for ready-to-use services.',
          'Highlight accessibility and cost-effectiveness.',
          'Connect cloud with digital learning.',
        ],
      },
      {
        name: 'Bank of America – Microsoft Cloud Transformation',
        context:
          'Bank of America adopted Microsoft Cloud to support digital transformation, improve security, and enhance customer services.',
        keyConcepts: [
          'Hybrid cloud',
          'Security',
          'Compliance',
          'Digital transformation',
        ],
        application:
          'Microsoft Cloud provides secure infrastructure and tools for banking operations while maintaining compliance and scalability.',
        takeaways: [
          'Emphasize security and compliance in banking.',
          'Mention hybrid cloud for balancing control and scalability.',
          'Link cloud to improved customer services.',
        ],
      },
      {
        name: 'Unilever Case Study',
        context:
          'Unilever uses cloud computing to manage global operations, improve supply chain efficiency, and support large-scale data processing.',
        keyConcepts: [
          'Cloud scalability',
          'Data management',
          'Global operations',
          'Cloud platforms',
        ],
        application:
          'Cloud platforms help Unilever process large datasets and coordinate operations across multiple regions efficiently.',
        takeaways: [
          'Highlight scalability and global access.',
          'Explain cloud role in data-driven decisions.',
          'Mention operational efficiency improvements.',
        ],
      },
      {
        name: 'Siemens IT Solutions and Services',
        context:
          'Siemens uses cloud solutions to improve IT service delivery, reduce operational costs, and enhance system performance.',
        keyConcepts: [
          'Cloud services',
          'IT optimization',
          'Cost reduction',
          'Performance improvement',
        ],
        application:
          'Cloud infrastructure helps Siemens deliver IT services more efficiently with better resource utilization.',
        takeaways: [
          'Mention cost savings and efficiency.',
          'Explain improved performance through cloud.',
          'Relate to enterprise IT modernization.',
        ],
      },
    ],
  },
  lessons: [
    {
      id: 'ccfa-01',
      lessonNumber: 1,
      title: 'Cloud Computing',
      pdfPath: '/pdfs/ccfa/ccfa_main.pdf',
      covers: 'Introduces cloud computing basics, servers, characteristics, evolution, and security standards.',
      pageRange: { start: 1, end: 14 },
      tags: ['theory-heavy', 'conceptual'],
      resources: [
        { type: 'pdf', label: 'Chapter 1 Notes', path: '/pdfs/ccfa/ccfa_main.pdf', pageRange: { start: 1, end: 14 } },
      ],
      topics: [
        {
          id: 'ccfa-01-t1',
          title: 'Basics of Cloud Computing and Servers',
          summary: 'Cloud computing is renting technology instead of owning it. It involves using services online without buying expensive hardware or maintaining servers.',
          analogy: 'Just like using electricity from a grid without owning a power station. A server is like a restaurant kitchen serving customers (users).',
          definitions: [
            { term: 'Cloud Computing', description: 'Renting computing services like storage, software, and servers through the internet.' },
            { term: 'Server', description: 'A powerful computer that stores data and works for other computers (clients) by sending information when needed.' },
          ],
          keyConcepts: ['Renting technology', 'Internet-based services', 'Server-Client model'],
          examples: ['Google Drive', 'Gmail', 'Netflix', 'Zoom/Google Meet'],
          subtopics: [
            'Simple meaning of cloud computing',
            'Real-life examples for students',
            'Definition and daily life examples of servers',
            'Comparison: Normal Computer vs Server',
            'Comparison: Traditional vs Cloud Computing'
          ],
          comparisonTable: {
            title: 'Traditional vs Cloud Computing',
            headers: ['Aspect', 'Traditional Computing', 'Cloud Computing'],
            rows: [
              ['Hardware', 'Buy servers & software', 'Rent services online'],
              ['Cost', 'High initial cost', 'Low initial cost'],
              ['Maintenance', 'Required', 'No maintenance'],
              ['Scalability', 'Limited', 'Easy to scale '],
              ['Location', 'Fixed location', 'Accessible anywhere '],
            ],
          },
          pageRange: { start: 1, end: 3 },
          hasExamples: true,
        },
        {
          id: 'ccfa-01-t2',
          title: 'Characteristics and Evolution of Cloud',
          summary: 'Details the five NIST characteristics and the historical steps from traditional computing to modern cloud systems.',
          standardDefinition: 'NIST identifies five essential characteristics: On-Demand Self-Service, Broad Network Access, Resource Pooling, Rapid Elasticity, and Measured Services.',
          keyConcepts: ['Elasticity', 'Resource Pooling', 'Client-Server evolution', 'Virtualization'],
          subtopics: [
            'NIST Characteristics (5 points)',
            'Evolution: Traditional -> Client-Server -> Internet & Virtualization -> Cloud',
            'Benefits: Cost reduction, scalability, and greener environment',
            'Challenges: Security, vendor lock-in, and internet dependency'
          ],
          pageRange: { start: 3, end: 9 },
          hasExamples: true,
        },
        {
          id: 'ccfa-01-t3',
          title: 'Cloud Standards and Security References',
          summary: 'Covers the protocols and organizations that ensure security, interoperability, and portability in the cloud  .',
          definitions: [
            { term: 'Authentication', description: 'Verifies who the user is (identity check).' },
            { term: 'Authorization', description: 'Decides what the user can access after login.' },
          ],
          keyConcepts: ['SSL/TLS (IETF)', 'OAuth', 'NIST Standards', 'Interoperability'],
          subtopics: [
            'Authentication vs Authorization',
            'Security Technologies (SSL, TLS, OAuth, SAML)',
            'Standard Organizations (IETF, OASIS, W3C, NIST, ITU-T)',
            'Data and System Portability (OVF)'
          ],
          pageRange: { start: 9, end: 14 },
          hasExamples: true,
        }
      ],
    },//
    {
      id: 'ccfa-02',
      lessonNumber: 2,
      title: 'Cloud Deployment Models and Cloud Service Delivery Models',
      pdfPath: '/pdfs/ccfa/ccfa_main.pdf',
      covers: 'Explains the major cloud deployment models (Public, Private, Hybrid, Community) and service delivery models (IaaS, PaaS, SaaS) with real-world case studies.',
      pageRange: { start: 15, end: 38 },
      tags: ['theory-heavy', 'comparison-focused'],
      formulas: [],
      resources: [
        { type: 'pdf', label: 'CCFA Unit 2 Notes', path: '/pdfs/ccfa/ccfa_main.pdf', pageRange: { start: 15, end: 38 } },
      ],
      topics: [
        {
          id: 'ccfa-02-t1',
          title: 'Cloud Deployment Models',
          summary: 'A deployment model defines the location, ownership, and access management of cloud infrastructure.',
          analogy: 'Deployment models are like housing: Public is a shared apartment, Private is a dedicated house, and Hybrid is keeping some things in a safe while using a shared backyard.',
          definitions: [
            { term: 'Public Cloud', description: 'Owned and managed by third-party providers, shared among multiple users over the internet.' },
            { term: 'Private Cloud', description: 'Dedicated infrastructure used exclusively by one organization; can be on-site or outsourced.' },
            { term: 'Hybrid Cloud', description: 'Combines public and private clouds, allowing data and apps to move between them for balance.' },
            { term: 'Community Cloud', description: 'Shared by several organizations with common goals, such as security requirements or business domains.' }
          ],
          keyConcepts: ['Shared infrastructure', 'Dedicated ownership', 'Balanced security', 'Common compliance'],
          useCases: ['Startups using Google Drive', 'Banks using Private Cloud for financial data', 'E-commerce using Hybrid Cloud for sales spikes'],
          examples: ['AWS (Public)', 'Microsoft Government Community Cloud', 'Amazon VPC (Private)'],
          subtopics: [
            'Definition and features of Public Cloud',
            'Variants of Private Cloud (On-site vs. Outsourced)',
            'Hybrid Cloud best practices',
            'Community Cloud requirements',
            'Public vs. Private comparison'
          ],
          comparisonTable: {
            title: 'Comparison of Public and Private Cloud',
            headers: ['Feature', 'Public Cloud', 'Private Cloud'],
            rows: [
              ['Access', 'Public subscribers', 'Internal stakeholders'],
              ['Security', 'Medium to Low', 'Very High'],
              ['Scalability', 'Very High', 'Limited'],
              ['Cost', 'Low (Pay-per-use)', 'High (Fixed cost)'],
              ['Tenancy', 'Multi-tenancy', 'Single tenancy']
            ],
          },
          pageRange: { start: 15, end: 20 },
          hasNumericals: false,
          hasExamples: true,
        },
        {
          id: 'ccfa-02-t2',
          title: 'Cloud Service Delivery Models',
          summary: 'Explains the three fundamental layers of cloud services: Infrastructure, Platform, and Software.',
          analogy: 'Think of a mobile recharge: You don’t build the tower (IaaS), you just use the data plan (SaaS). Or renting a house: IaaS is the empty building, PaaS is the furnished setup, SaaS is the hotel room.',
          definitions: [
            { term: 'IaaS', description: 'Provides raw computing resources like virtual machines, storage, and networking (e.g., AWS EC2).' },
            { term: 'PaaS', description: 'Provides a platform with OS and tools for developers to build apps without managing hardware.' },
            { term: 'SaaS', description: 'Provides ready-to-use software delivered over the web (e.g., Gmail, Zoom).' }
          ],
          keyConcepts: ['Virtualization', 'Cloud Bursting', 'Runtime Environments', 'Multitenant Model'],
          useCases: ['Hosting virtual servers (IaaS)', 'Developing apps on Heroku (PaaS)', 'Using Salesforce CRM (SaaS)'],
          examples: ['Microsoft Azure VMs', 'Google App Engine', 'Microsoft Office 365'],
          subtopics: [
            'IaaS characteristics and Cloud Bursting',
            'PaaS benefits for developers',
            'SaaS on-demand software distribution',
            'Limitations and security vulnerabilities of each model',
            'Case Study: Siemens and Bank of America'
          ],
          comparisonTable: {
            title: 'IaaS vs PaaS vs SaaS Responsibility',
            headers: ['Model', 'User Controls', 'Provider Manages', 'Target Users'],
            rows: [
              ['IaaS', 'OS, Apps, Data, Middleware', 'Hardware, Storage, Networking', 'IT Administrators'],
              ['PaaS', 'Applications and Data', 'OS, Runtime, Hardware', 'Developers'],
              ['SaaS', 'Usage and basic settings', 'Full software stack', 'End Users']
            ],
          },
          pageRange: { start: 20, end: 38 },
          hasNumericals: false,
          hasExamples: true,
        },
      ],
    },//
    {
      id: 'ccfa-03',
      lessonNumber: 3,
      title: 'Introduction to Cloud Reference Architecture',
      pdfPath: '/pdfs/ccfa/ccfa3.pdf',
      covers: 'Covers the structural design of cloud systems, front-end and back-end components, NIST actors, and the Cisco Cloud Framework.',
      pageRange: { start: 1, end: 26 },
      tags: ['architecture', 'blueprint', 'technical-theory'],
      resources: [
        { type: 'pdf', label: 'CCFA Lesson 3 Notes', path: '/pdfs/ccfa/ccfa3.pdf', pageRange: { start: 1, end: 26 } },
      ],
      topics: [
        {
          id: 'ccfa-03-t1',
          title: 'Cloud Architecture Components',
          summary: 'Cloud architecture is the blueprint showing how parts like the front end, back end, and network work together to deliver services.',
          definitions: [
            { term: 'Front End', description: 'The client-side interface including web browsers and mobile apps used by the user.' },
            { term: 'Back End', description: 'The provider-side infrastructure including servers, storage, databases, and virtual machines.' }
          ],
          keyConcepts: ['Client-side interface', 'Cloud-side processing', 'Management & Security layer'],
          useCases: ['Using Google Chrome (Front End) to access Gmail servers (Back End)'],
          subtopics: [
            'Main components of cloud architecture',
            'Front end vs Back end functions',
            'Role of the network and management layers'
          ],
          pageRange: { start: 1, end: 3 },
          hasExamples: true,
        },
        {
          id: 'ccfa-03-t2',
          title: 'NIST Cloud Computing Reference Architecture (NCCRA)',
          summary: 'A standard framework identifying the five major actors and their roles in a cloud environment.',
          standardDefinition: 'NCCRA is a high-level conceptual model that defines the actors, activities, and functions in cloud computing.',
          definitions: [
            { term: 'Cloud Provider', description: 'Entity that makes services available to interested parties.' },
            { term: 'Cloud Consumer', description: 'The person or organization that maintains a business relationship with, and uses service from, Cloud Providers.' },
            { term: 'Cloud Broker', description: 'An entity that manages the use, performance, and delivery of cloud services and negotiates relationships between providers and consumers.' }
          ],
          keyConcepts: ['Five major actors', 'Cloud Auditor', 'Cloud Carrier', 'Service Mediation'],
          subtopics: [
            'Cloud Consumer roles (SaaS, PaaS, IaaS consumers)',
            'Cloud Provider activities (Service orchestration, Resource abstraction)',
            'Cloud Broker functions (Service intermediation, Aggregation, Arbitrage)',
            'Cloud Auditor and Security/Privacy audits',
            'Cloud Carrier and network connectivity'
          ],
          pageRange: { start: 4, end: 21 },
          hasExamples: true,
        },
        {
          id: 'ccfa-03-t3',
          title: 'Cisco and IETF Reference Frameworks',
          summary: 'Explains specific industry frameworks like CISCO CRA for service orchestration and secure delivery.',
          definitions: [
            { term: 'Service Orchestration', description: 'The layer that integrates infrastructure into usable services, acting as the "glue".' },
            { term: 'Cloud Carrier', description: 'The intermediary that provides connectivity and transport of cloud services from providers to consumers.' }
          ],
          keyConcepts: ['CISCO 5-layer framework', 'Data Centre Technology Architecture', 'Service Delivery and Management'],
          subtopics: [
            'IETF Cloud Reference Framework (CRF)',
            'CISCO Cloud Reference Architecture Layers',
            'Security Architecture Layer',
            'Simple CISCO Use Case Flow'
          ],
          comparisonTable: {
            title: 'Comparison of Cloud Frameworks',
            headers: ['Feature', 'NIST (NCCRA)', 'CISCO CRA'],
            rows: [
              ['Focus', 'Actor roles and responsibilities', 'Service orchestration and secure delivery'],
              ['Main Elements', '5 Major Actors', '5 Functional Layers'],
              ['Best For', 'Compliance and standard naming', 'Technical implementation and management']
            ],
          },
          pageRange: { start: 22, end: 26 },
          hasExamples: true,
        }
      ]
    },//
    {
      id: 'ccfa-04',
      lessonNumber: 4,
      title: 'Cloud Programming & Software Environment',
      pdfPath: '/pdfs/ccfa/ccfa4.pdf',
      covers: 'Detailed overview of major cloud platforms (AWS, Azure, GCP) and the hierarchical taxonomy of cloud services including infrastructure, platform, and management layers.',
      pageRange: { start: 1, end: 72 },
      tags: ['providers', 'AWS', 'Azure', 'taxonomy'],
      resources: [
        { type: 'pdf', label: 'CCFA Lesson 4 Notes', path: '/pdfs/ccfa/ccfa4.pdf', pageRange: { start: 1, end: 72 } },
      ],
      topics: [
        {
          id: 'ccfa-04-t1',
          title: 'Major Cloud Service Providers & Ecosystem',
          summary: 'Analysis of leading cloud platforms and their core strengths. AWS focuses on IaaS/PaaS, GCP excels in data analytics/AI, and Azure integrates with existing Microsoft tools[cite: 5, 7, 8].',
          keyConcepts: ['Market Leaders', 'Open-Source Cloud Platforms', 'CRM Systems'],
          definitions: [
            { term: 'Cloud Platforms', description: 'Big companies that provide computing resources, storage, and software over the internet instead of on local servers [cite: 3-4].' },
            { term: 'CRM (Customer Relationship Management)', description: 'Software like Salesforce or Zoho used by businesses to manage customer details, sales, and marketing in one place [cite: 11-14].' }
          ],
          subtopics: [
            'Amazon Web Services (AWS): Largest provider, covers all service models [cite: 15-18]',
            'Google Cloud Platform (GCP): Strong in Big Data and AI using internal Google technologies [cite: 6-7]',
            'Microsoft Azure: Preferred for Windows-based enterprises [cite: 8]',
            'Open-Source Platforms: Eucalyptus, Open Nebula, and Nimbus for private clouds [cite: 9]'
          ],
          pageRange: { start: 1, end: 3 },
          hasExamples: true,
        },
        {
          id: 'ccfa-04-t2',
          title: 'AWS Layered Architecture & Services',
          summary: 'AWS uses a layered approach categorized into Foundation, Application, and Deployment & Management layers [cite: 51-53].',
          keyConcepts: ['Infrastructure as Code', 'Global Infrastructure', 'Elastic Computing'],
          definitions: [
            { term: 'EC2 Instance', description: 'A virtual server in the cloud created from an AMI (Amazon Machine Image)[cite: 25].' },
            { term: 'CloudFormation', description: 'A service that automates infrastructure setup using code (Infrastructure as Code) [cite: 58-61].' },
            { term: 'VPC (Virtual Private Cloud)', description: 'A logically isolated private network inside the AWS cloud [cite: 113, 602-603].' }
          ],
          subtopics: [
            'Foundation Services: Compute (EC2), Storage (S3, EBS), and Database (RDS) [cite: 569]',
            'Application Services: CloudFront (CDN), SQS (Queue), and SNS (Notification) [cite: 567]',
            'Deployment & Management: IAM for security, CloudWatch for monitoring, and Beanstalk for deployment [cite: 550, 562, 566]',
            'Global Infrastructure: Regions, Availability Zones, and Edge Locations [cite: 521-523, 570-576]'
          ],
          comparisonTable: {
            title: 'Common AWS Service Use-Cases',
            headers: ['Service', 'Category', 'Primary Use'],
            rows: [
              ['EC2', 'Compute', 'Renting virtual servers for applications [cite: 388-389]'],
              ['S3', 'Storage', 'Storing large files, videos, and backups [cite: 446]'],
              ['RDS', 'Database', 'Managed relational databases (SQL) [cite: 488-490]'],
              ['CloudWatch', 'Management', 'Monitoring performance and resource health [cite: 510-512]']
            ],
          },
          pageRange: { start: 4, end: 15 },
          hasExamples: true,
        },
        {
          id: 'ccfa-04-t3',
          title: 'Microsoft Azure Components & Networking',
          summary: 'Azure provides a layered cloud architecture focusing on enterprise-level networking, compute, and data management [cite: 166-167, 224-225].',
          definitions: [
            { term: 'Input Endpoint', description: 'An entry point (port) through which users access an Azure service [cite: 170-171].' },
            { term: 'ExpressRoute', description: 'A dedicated private connection to Azure that does not go over the public internet[cite: 184, 216].' },
            { term: 'Azure Active Directory', description: 'A cloud-based identity service for authentication and single sign-on (SSO) [cite: 235-236].' }
          ],
          keyConcepts: ['Automatic Load Balancing', 'High Availability', 'Mobile Ecosystems'],
          subtopics: [
            'Compute: Virtual Machines, Web Apps, and Cloud Services (PaaS) [cite: 185-189]',
            'Data Management: Blob Storage (unstructured), SQL Database, and Queues [cite: 221-222]',
            'Developer Tools: Azure SDK and Automation workflows [cite: 227, 231]',
            'Backup & Recovery: Site Recovery for disasters and Azure Backup for data protection [cite: 242-243]'
          ],
          pageRange: { start: 62, end: 72 },
          hasExamples: true,
        }
      ]
    },
    {
      id: 'ccfa-05',
      lessonNumber: 5,
      title: 'Cloud Storage',
      covers: 'Covers the Kellogg case study (SAP HANA on AWS), fundamentals of cloud storage, and practical synchronization using Dropbox.',
      pageRange: { start: 1, end: 70 },
      tags: ['case-study', 'storage', 'synchronization'],
      resources: [
        { type: 'pdf', label: 'CCFA Lesson 5 Notes', path: '/pdfs/ccfa/ccfa5.pdf', pageRange: { start: 1, end: 70 } },
      ],
      topics: [
        {
          id: 'ccfa-05-t1',
          title: 'Case Study: Kellogg’s on AWS',
          summary: 'Analysis of how Kellogg’s implemented SAP HANA on AWS to handle massive business data and improve real-time analytics.',
          keyConcepts: ['SAP HANA', 'In-memory database', 'Real-time analytics'],
          definitions: [
            { term: 'SAP HANA', description: 'An in-memory database platform that provides high-performance data processing and real-time analytics.' }
          ],
          subtopics: [
            'Challenges faced by Kellogg: Large data volumes and slow reporting',
            'AWS Deployment Architecture: EC2 (Compute), EBS (Storage), and VPC (Networking)',
            'Benefits: 90% faster reporting and reduced hardware costs'
          ],
          pageRange: { start: 1, end: 2 },
          hasExamples: true,
        },
        {
          id: 'ccfa-05-t2',
          title: 'Fundamentals of Cloud Storage',
          summary: 'Cloud storage allows users to store and manage data on remote servers accessed via the internet, eliminating the need for local hardware.',
          analogy: 'Cloud storage is like a "Cloud Kitchen": you don’t own the kitchen or equipment, but you get the food (data) delivered wherever you are.',
          definitions: [
            { term: 'Cloud Storage', description: 'A model of networked online storage where data is stored in virtualized pools of storage hosted by third parties.' }
          ],
          keyConcepts: ['On-demand storage', 'Data accessibility', 'Scalability'],
          subtopics: [
            'Concept of "Anywhere, Anytime" access',
            'Cost-effectiveness and pay-as-you-go billing',
            'Data backup and disaster recovery benefits'
          ],
          pageRange: { start: 3, end: 15 },
          hasExamples: true,
        },
        {
          id: 'ccfa-05-t3',
          title: 'Practical Implementation: Dropbox',
          summary: 'A step-by-step look at how Dropbox provides cloud synchronization and storage services.',
          keyConcepts: ['Synchronization', 'Cloud Folder', 'Referral Bonus'],
          subtopics: [
            'Installation and Dropbox Folder creation',
            'The Sync Process: Uploading and updating files across devices',
            'Storage limits: 2 GB free space and referral system (up to 16 GB)',
            'Cross-platform compatibility (Windows, Mac, Smartphones)'
          ],
          pageRange: { start: 68, end: 70 },
          hasExamples: true,
          comparisonTable: {
            title: 'Local Storage vs. Cloud Storage (Dropbox)',
            headers: ['Feature', 'Local Storage', 'Dropbox Cloud Storage'],
            rows: [
              ['Physical Device', 'Required (Hard drive/USB)', 'Not required'],
              ['Access', 'Only on that specific device', 'Any device with internet'],
              ['Sharing', 'Manual (Copy/Paste)', 'Automatic via links'],
              ['Backup', 'Manual process', 'Automatic synchronization']
            ],
          },
        }
      ]
    },
    {
      id: 'ccfa-06',
      lessonNumber: 6,
      title: 'Cloud Computing Security',
      covers: 'Detailed analysis of cloud security threats, real-world incidents (iCloud/PSN), CSA Notorious Nine, and NIST Security Reference Architecture.',
      pageRange: { start: 1, end: 50 }, // Based on the pdf content ending at page 50
      tags: ['exam-heavy', 'security-threats', 'IAM', 'compliance'],
      resources: [
        { type: 'pdf', label: 'CCFA Unit 6 Notes', path: '/pdfs/ccfa/ccfa6.pdf', pageRange: { start: 1, end: 50 } },
      ],
      topics: [
        {
          id: 'ccfa-06-t1',
          title: 'Significance of Cloud Security & Real-World Breaches',
          summary: 'Explains why security is the top priority in cloud computing by analyzing historical attacks and vulnerabilities.',
          keyConcepts: ['Data Sovereignty', 'Hypervisor Vulnerabilities', 'Attack-as-a-Service'],
          subtopics: [
            'Importance of security due to remote storage and multi-tenancy',
            'Case Study: 2014 Botnet Malware (Infected 500k PCs to create a private cloud)',
            'Case Study: Xen Hypervisor vulnerability in Amazon EC2',
            'Notable Breaches: Apple iCloud and Sony PlayStation Network (PSN)',
            'The rise of Cloud-based DDoS attacks (Attack-as-a-Service)'
          ],
          pageRange: { start: 1, end: 10 },
          hasExamples: true,
        },
        {
          id: 'ccfa-06-t2',
          title: 'Cloud Security Threat Taxonomy (CSA & NIST)',
          summary: 'Classification of security risks from the Cloud Security Alliance (CSA) and NIST perspectives.',
          definitions: [
            { term: 'The Notorious Nine', description: 'CSA’s list of top threats including Data Breaches, Account Hijacking, and Insecure APIs.' },
            { term: 'Malware Injection', description: 'Attacker injects malicious code into the cloud service to steal data or control the system.' },
            { term: 'Metadata Spoofing', description: 'An attack on web services where the attacker modifies the metadata to bypass security.' }
          ],
          keyConcepts: ['Data Loss', 'Shared Technology Issues', 'Denial of Service (DoS)'],
          subtopics: [
            'NIST Threat Categories: Botnets, Phishing, and Brute-force attacks',
            'Insecure Interfaces and APIs',
            'Malicious Insiders and Vendor Lock-in risks',
            'Technical attacks: Flooding and Metadata spoofing'
          ],
          pageRange: { start: 11, end: 40 },
          hasExamples: true,
        },
        {
          id: 'ccfa-06-t3',
          title: 'IAM, Compliance, and Reference Architectures',
          summary: 'Technological solutions and frameworks like IAM and NIST SRA to mitigate cloud risks.',
          keyConcepts: ['NIST SRA', 'Identity Federation', 'RBAC'],
          definitions: [
            { term: 'IAM', description: 'Identity and Access Management: Consists of Authentication + Authorization + User Profile + Compliance.' },
            { term: 'RBAC', description: 'Role-Based Access Control: Assigning permissions based on job roles (Admin, Manager, User).' },
            { term: 'Identity Federation', description: 'Linking a user’s identity across multiple separate security domains (e.g., using Google Login for other apps).' }
          ],
          subtopics: [
            'NIST Security Reference Architecture (SRA) roles: Consumer, Provider, and Auditor',
            'Authentication vs. Authorization mechanisms',
            'Security Standards: XACML (Access Control) and XSPA (Privacy Authorization)',
            'Regulatory Compliance: Aligning organizational policies with cloud legal requirements'
          ],
          comparisonTable: {
            title: 'Access Control Models Comparison',
            headers: ['Model', 'Description', 'Best Use Case'],
            rows: [
              ['RBAC', 'Access based on user roles', 'Enterprise staff management'],
              ['ACL', 'List of permissions for specific users', 'File-level security'],
              ['MAC', 'Strict security levels (Secret, Top Secret)', 'Military or high-security government use'],
              ['SQL Views', 'Restricting database table access', 'Sensitive data protection in DBs']
            ],
          },
          pageRange: { start: 41, end: 50 },
          hasExamples: true,
        }
      ]
    },
    {
      id: 'ccfa-07',
      lessonNumber: 7,
      title: 'Virtualization',
      covers: 'Comprehensive guide to virtualization, including hypervisor types, full vs. para-virtualization, and implementations like server, desktop, and application virtualization.',
      pageRange: { start: 1, end: 32 }, 
      tags: ['virtualization', 'hypervisor', 'containers', 'infrastructure'],
      resources: [
        { type: 'pdf', label: 'CCFA Unit 7 Notes', path: '/pdfs/ccfa/ccfa7.pdf', pageRange: { start: 1, end: 32 } },
      ],
      topics: [
        {
          id: 'ccfa-07-t1',
          title: 'Introduction to Virtualization',
          summary: 'Definition and core mechanics of how a single physical computer acts as multiple virtual machines (VMs).',
          definitions: [
            { term: 'Virtualization', description: 'Technology that allows one physical computer to act like multiple computers by dividing physical resources.' },
            { term: 'Hypervisor (VMM)', description: 'Software that creates and manages VMs, acting as a manager between hardware and virtual systems.' },
            { term: 'Host vs. Guest OS', description: 'The Host OS runs on the real hardware; the Guest OS runs inside a virtual machine.' }
          ],
          keyConcepts: ['Resource Sharing', 'Isolation', 'Scalability'],
          subtopics: [
            'How virtualization works: The Hypervisor layer[cite: 6].',
            'Native (Bare-Metal) vs. Hosted Virtualization[cite: 6].',
            'Benefits: Better resource utilization (from 15% to 80%), cost reduction, and green computing[cite: 6].',
            'Limitations: Single point of failure and performance overhead[cite: 6].'
          ],
          pageRange: { start: 1, end: 11 },
          hasExamples: true,
        },
        {
          id: 'ccfa-07-t2',
          title: 'Approaches to Virtualization',
          summary: 'The different technical methods used to achieve virtualization at the OS and hardware levels[cite: 6].',
          keyConcepts: ['Binary Rewriting', 'Hypercalls', 'Containerization'],
          subtopics: [
            'Full Virtualization: Uses binary translation to run unmodified Guest OS; any OS can run but it is slower[cite: 6].',
            'Para-virtualization: Guest OS is modified to use "hypercalls" to talk directly to the hypervisor for faster performance[cite: 6].',
            'Hardware-Assisted: Uses CPU features like Intel VT-x or AMD-V to reduce overhead[cite: 6].',
            'OS-Level (Containerization): Multiple isolated environments (containers) share the same Host OS kernel; lightweight and fast (e.g., Docker)[cite: 6].',
            'Kernel-Level: Extends the Linux kernel (e.g., KVM) to act as a hypervisor[cite: 6].'
          ],
          pageRange: { start: 12, end: 22 },
          hasExamples: true,
        },
        {
          id: 'ccfa-07-t3',
          title: 'Types of Virtualization Implementations',
          summary: 'Practical applications of virtualization across servers, desktops, and applications[cite: 6].',
          keyConcepts: ['VDI', 'Server Consolidation', 'Application Streaming'],
          subtopics: [
            'Server Virtualization: Consolidating multiple physical servers into one to save space and power[cite: 6].',
            'Client (Desktop) Virtualization: Virtual Desktop Infrastructure (VDI) where desktops are hosted on servers and accessed via network[cite: 6].',
            'Storage Virtualization: Combining multiple physical storage devices into a single virtual pool[cite: 6, 5].',
            'Application Virtualization: Running apps without local installation (e.g., JVM, Application Streaming)[cite: 6].',
            'Emulation: Completely imitating a different hardware architecture (e.g., running Android on Windows via QEMU)[cite: 6].'
          ],
          comparisonTable: {
            title: 'Virtualization Approaches Comparison',
            headers: ['Feature', 'Full Virtualization', 'Para-virtualization', 'OS-Level (Containers)'],
            rows: [
              ['Guest OS', 'Unmodified (Any OS)', 'Modified (Open-source only)', 'Shares Host Kernel (Same OS)'],
              ['Performance', 'Moderate', 'High', 'Very High'],
              ['Isolation', 'Strongest', 'Strong', 'Moderate'],
              ['Overhead', 'High (Emulation)', 'Low', 'Very Low']
            ],
          },
          pageRange: { start: 23, end: 32 },
          hasExamples: true,
        }
      ]
    },
    {
      id: 'ccfa-08',
      lessonNumber: 8,
      title: 'Virtualization Architecture and Management',
      covers: 'Technical deep-dive into System Architecture (ISA, ABI, API), Execution Modes, and the 12 key features of Virtualization Management.',
      pageRange: { start: 1, end: 40 },
      tags: ['architecture', 'ISA', 'kernel-mode', 'management-tools'],
      resources: [
        { type: 'pdf', label: 'CCFA Unit 8 Notes', path: '/pdfs/ccfa/ccfa8.pdf', pageRange: { start: 1, end: 40 } },
      ],
      topics: [
        {
          id: 'ccfa-08-t1',
          title: 'Computer System Architecture & Interfaces',
          summary: 'Understanding the layers between hardware and software that make virtualization possible, specifically ISA, ABI, and API.',
          definitions: [
            { term: 'ISA (Instruction Set Architecture)', description: 'The boundary between hardware and software; the set of instructions a processor understands.' },
            { term: 'ABI (Application Binary Interface)', description: 'The interface between libraries and the Operating System, defining binary-level interaction.' },
            { term: 'API (Application Programming Interface)', description: 'The interface between applications and libraries/OS using high-level functions.' }
          ],
          keyConcepts: ['User ISA vs Full ISA', 'Binary Level Interaction', 'System Calls'],
          subtopics: [
            'User ISA for applications vs. Full ISA for the Operating System',
            'Overall Flow: Application -> API -> Libraries -> ABI -> OS -> ISA -> Hardware',
            'How virtualization depends on these standard interfaces'
          ],
          pageRange: { start: 1, end: 4 },
          hasExamples: true,
        },
        {
          id: 'ccfa-08-t2',
          title: 'Execution Modes and Virtualization Logic',
          summary: 'Explains how systems switch between restricted User Mode and privileged Kernel Mode to maintain security and control.',
          keyConcepts: ['User Mode', 'Kernel (Supervisor) Mode', 'Privileged Instructions'],
          definitions: [
            { term: 'User Mode', description: 'Mode used by application programs with limited access to hardware to prevent system crashes.' },
            { term: 'Kernel Mode', description: 'Mode used by the OS with full control over hardware and memory.' }
          ],
          subtopics: [
            'The process of making a System Call to shift control',
            'Handling Privileged Instructions in a virtual environment',
            'The role of the Hypervisor in managing mode transitions'
          ],
          pageRange: { start: 5, end: 15 },
          hasExamples: true,
        },
        {
          id: 'ccfa-08-t3',
          title: 'Virtualization Management Features',
          summary: 'A comprehensive list of 12 essential features required to manage a virtualized data center effectively.',
          analogy: 'The Virtualization Manager is like a Hostel Warden: students are VMs, rooms are hardware resources. The warden ensures everyone has a room and follows the rules.',
          keyConcepts: ['Dynamic Workload Balancing', 'Capacity Planning', 'Rollback'],
          subtopics: [
            'Configuration and Capacity Planning: Setting up and predicting resource needs.',
            'Performance Monitoring: Tracking CPU and memory usage in real-time.',
            'Dynamic Workload Balancing: Shifting loads automatically when one VM is too busy.',
            'Power Management: Saving energy by turning off unused virtual resources.',
            'Backup and Rollback: Saving the state of a VM to restore it after a failure.',
            'Garbage Collection: Removing unused files and reclaiming resources.'
          ],
          comparisonTable: {
            title: 'Virtualization Management Tools',
            headers: ['Feature', 'Purpose', 'Impact'],
            rows: [
              ['Workload Balancing', 'Distribute load evenly across VMs', 'Prevents system slowdown'],
              ['Capacity Planning', 'Decide future resource needs', 'Prevents hardware shortage'],
              ['Alerts & Reporting', 'Notify on failure/high load', 'Ensures high availability'],
              ['Security Control', 'Manage access and protect data', 'Ensures multi-tenant safety']
            ],
          },
          pageRange: { start: 38, end: 40 },
          hasExamples: true,
        }
      ]
    },
  ],
}
