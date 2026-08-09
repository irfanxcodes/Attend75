/**
 * BlockRenderer — dispatches each block to the correct component
 */
import { NarrationBlock } from './NarrationBlock'
import { KeywordHighlight } from './KeywordHighlight'
import { DefinitionBlock } from './DefinitionBlock'
import { FormulaBlock } from './FormulaBlock'
import { ExampleBlock } from './ExampleBlock'
import { DiagramBlock } from './DiagramBlock'
import { QuizBlock } from './QuizBlock'
import { RecapBlock } from './RecapBlock'

export function BlockRenderer({ block, isActive, onComplete, onQuizAnswer }) {
  if (!block) return null

  const props = { block, isActive, onComplete }

  switch (block.block_type) {
    case 'narration':
      return <NarrationBlock {...props} />
    case 'keyword_highlight':
      return <KeywordHighlight {...props} />
    case 'definition':
      return <DefinitionBlock {...props} />
    case 'formula':
      return <FormulaBlock {...props} />
    case 'example':
      return <ExampleBlock {...props} />
    case 'diagram_spec':
      return <DiagramBlock {...props} />
    case 'quiz':
      return <QuizBlock block={block} onAnswer={onQuizAnswer} />
    case 'recap':
      return <RecapBlock block={block} onComplete={onComplete} />
    default:
      // Unknown block type — render as plain text and advance
      return (
        <div className="py-2 text-[#9F9AB5] text-sm">
          {block.content}
        </div>
      )
  }
}
