import { ContextualTrigger } from '../types/personaAdvanced';

// Natural conversation triggers based on context rather than keywords
export const contextualTriggers: Record<string, ContextualTrigger> = {
  'tech-lead': {
    conversationMoments: ['architectural decisions needed', 'junior asking questions', 'technical direction unclear'],
    buildOnPatterns: [
      "Building on {speaker}'s point about {topic}...",
      "That's a great insight, {speaker}. I'd add that...",
      "I've seen this pattern before when {speaker} mentioned {topic}..."
    ],
    questionPatterns: [
      "Have we considered how {topic} might affect our long-term architecture?",
      "What's driving the decision around {topic}?",
      "How does this align with our technical strategy?"
    ],
    supportPatterns: [
      "That's exactly right, {speaker}.",
      "Good question! Let me explain...",
      "I like where {speaker} is going with {topic}..."
    ]
  },
  'software-engineer': {
    conversationMoments: ['implementation details discussed', 'code quality concerns', 'technical solutions needed'],
    buildOnPatterns: [
      "That implementation approach could work. I'd suggest...",
      "Building on {speaker}'s idea, we could also...",
      "I've implemented something similar to what {speaker} described..."
    ],
    questionPatterns: [
      "How would we handle {specific_case} in that implementation?",
      "What's the performance impact of {approach}?",
      "Have we considered the maintainability of {solution}?"
    ],
    supportPatterns: [
      "That's a solid approach, {speaker}.",
      "I agree with {speaker} about {topic}.",
      "That pattern has worked well for me too."
    ]
  },
  'qa-engineer': {
    conversationMoments: ['new features discussed', 'user experience mentioned', 'edge cases overlooked'],
    buildOnPatterns: [
      "That feature sounds great. For testing, we'd want to...",
      "Building on {speaker}'s user story, what if...",
      "I'm thinking about how users would interact with what {speaker} described..."
    ],
    questionPatterns: [
      "How do we validate that {feature} works as expected?",
      "What happens if a user {edge_case}?",
      "How do we test the scenario {speaker} mentioned?"
    ],
    supportPatterns: [
      "That's a user-friendly approach, {speaker}.",
      "I like how {speaker} is thinking about the user experience.",
      "That would definitely improve quality."
    ]
  },
  'junior-developer': {
    conversationMoments: ['complex concepts discussed', 'architecture decisions made', 'technical jargon used'],
    buildOnPatterns: [
      "So if I understand {speaker} correctly...",
      "That makes sense! Building on what {speaker} said...",
      "I think I see what {speaker} means about {topic}..."
    ],
    questionPatterns: [
      "Can someone explain what {speaker} means by {concept}?",
      "I'm not sure I understand how {topic} works...",
      "Is {concept} similar to {simpler_concept}?"
    ],
    supportPatterns: [
      "That explanation really helps, {speaker}!",
      "Thanks for clarifying that, {speaker}.",
      "That's a great way to think about it."
    ]
  },
  'devops-engineer': {
    conversationMoments: ['deployment discussed', 'production concerns', 'infrastructure needs'],
    buildOnPatterns: [
      "For deployment, {speaker}'s approach would require...",
      "Building on the architecture {speaker} described...",
      "From an ops perspective, what {speaker} suggested..."
    ],
    questionPatterns: [
      "How do we deploy {feature} safely?",
      "What's the production impact of {change}?",
      "How do we monitor {system} in production?"
    ],
    supportPatterns: [
      "That's a deployment-friendly approach, {speaker}.",
      "I like how {speaker} is thinking about production.",
      "That would make operations much easier."
    ]
  },
  'data-scientist': {
    conversationMoments: ['data analysis needed', 'metrics discussed', 'patterns identified'],
    buildOnPatterns: [
      "Building on {speaker}'s analysis, the data shows...",
      "That insight from {speaker} aligns with what I've observed in the data...",
      "I can add some quantitative context to what {speaker} mentioned..."
    ],
    questionPatterns: [
      "What metrics would help us validate {speaker}'s hypothesis?",
      "Do we have data to support the {topic} assumption?",
      "How would we measure the success of {proposal}?"
    ],
    supportPatterns: [
      "The data definitely supports {speaker}'s point.",
      "That's consistent with the patterns I've seen.",
      "Great insight, {speaker} - the numbers back that up."
    ]
  },
  'policy-analyst': {
    conversationMoments: ['policy implications discussed', 'stakeholder impacts mentioned', 'implementation challenges'],
    buildOnPatterns: [
      "Building on {speaker}'s proposal, the implementation would require...",
      "That's a solid framework, {speaker}. We'd also need to consider...",
      "I can add some context about how similar policies have worked..."
    ],
    questionPatterns: [
      "What stakeholders would be affected by {speaker}'s proposal?",
      "How would we implement {policy} in practice?",
      "What unintended consequences should we consider?"
    ],
    supportPatterns: [
      "That's a well-thought-out approach, {speaker}.",
      "I agree with {speaker}'s assessment of the situation.",
      "That policy framework could really work."
    ]
  },
  'economist': {
    conversationMoments: ['economic impacts discussed', 'cost-benefit mentioned', 'market dynamics'],
    buildOnPatterns: [
      "From an economic perspective, {speaker}'s proposal would...",
      "Building on the cost analysis {speaker} mentioned...",
      "The market dynamics around what {speaker} described..."
    ],
    questionPatterns: [
      "What are the economic incentives in {speaker}'s proposal?",
      "How would this affect market behavior?",
      "What's the cost-benefit ratio of {approach}?"
    ],
    supportPatterns: [
      "The economics of {speaker}'s approach make sense.",
      "That's economically sound reasoning, {speaker}.",
      "The incentive structure {speaker} described would work."
    ]
  },
  'legal-expert': {
    conversationMoments: ['legal compliance mentioned', 'regulatory issues', 'legal precedents'],
    buildOnPatterns: [
      "From a legal standpoint, {speaker}'s approach would need...",
      "Building on the regulatory framework {speaker} mentioned...",
      "There's legal precedent for what {speaker} described..."
    ],
    questionPatterns: [
      "What are the legal implications of {speaker}'s proposal?",
      "Do we need regulatory approval for {approach}?",
      "How does this comply with existing laws?"
    ],
    supportPatterns: [
      "That's legally sound, {speaker}.",
      "I agree with {speaker}'s legal assessment.",
      "That approach would meet compliance requirements."
    ]
  },
  'philosopher': {
    conversationMoments: ['ethical questions raised', 'fundamental assumptions', 'moral implications'],
    buildOnPatterns: [
      "That raises important ethical questions about what {speaker} proposed...",
      "Building on {speaker}'s point, we should consider the moral implications...",
      "The philosophical underpinnings of {speaker}'s argument..."
    ],
    questionPatterns: [
      "What ethical framework should guide {speaker}'s proposal?",
      "What assumptions are we making about {topic}?",
      "How do we balance competing moral claims here?"
    ],
    supportPatterns: [
      "That's ethically sound reasoning, {speaker}.",
      "I appreciate {speaker}'s moral clarity on this.",
      "That philosophical approach is well-grounded."
    ]
  }
}; 