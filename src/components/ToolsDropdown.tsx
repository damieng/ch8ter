import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wrench, ChevronDown
} from 'lucide-preact'
import { CenterHIcon } from './CenterHIcon'
import {
  type FontInstance,
  createBoldVariant, createOutlineVariant, createProportionalVariant
} from '../store'
import {
  flipXBytes, flipYBytes, invertBytes, rotateCWBytes, rotateCCWBytes,
  shiftUp, shiftDown, shiftLeft, shiftRight, centerHorizontalBytes,
} from '../glyphTransforms'
import { execTransformSelection, execCopyRange } from '../undoHistory'
import { ObliqueDialog } from '../dialogs/ObliqueDialog'
import { MonospaceDialog } from '../dialogs/MonospaceDialog'
import { Dropdown } from './Dropdown'

const ICON = 16

export function ToolsDropdown({ font }: { font: FontInstance }) {
  const [obliqueOpen, setObliqueOpen] = useState(false)
  const [monospaceOpen, setMonospaceOpen] = useState(false)

  function iconBtn(icon: any, title: string, fn: () => void, close: () => void) {
    return (
      <button
        class="p-1.5 hover:bg-blue-50 rounded flex items-center justify-center"
        onClick={() => { fn(); close() }}
        title={title}
      >
        {icon}
      </button>
    )
  }

  function menuItem(label: string, fn: () => void, close: () => void) {
    return (
      <button
        class="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded"
        onClick={() => { fn(); close() }}
      >
        {label}
      </button>
    )
  }

  return (
    <Dropdown
      button={<><Wrench size={ICON} />Tools<ChevronDown size={14} /></>}
      popupClass="w-auto"
      extra={<>
        {obliqueOpen && createPortal(
          <ObliqueDialog font={font} onClose={() => setObliqueOpen(false)} />,
          document.body,
        )}
        {monospaceOpen && (
          <MonospaceDialog font={font} onClose={() => setMonospaceOpen(false)} />
        )}
      </>}
    >
      {(close) => (
        <>
          <div class="flex items-center gap-0 px-2 py-1">
            {iconBtn(<FlipHorizontal size={ICON} />, 'Flip X', () => execTransformSelection(font, flipXBytes, 'Flip X'), close)}
            {iconBtn(<FlipVertical size={ICON} />, 'Flip Y', () => execTransformSelection(font, flipYBytes, 'Flip Y'), close)}
            {iconBtn(<Contrast size={ICON} />, 'Invert', () => execTransformSelection(font, invertBytes, 'Invert'), close)}
            {iconBtn(<RotateCw size={ICON} />, 'Rotate CW', () => execTransformSelection(font, rotateCWBytes, 'Rotate CW'), close)}
            {iconBtn(<RotateCcw size={ICON} />, 'Rotate CCW', () => execTransformSelection(font, rotateCCWBytes, 'Rotate CCW'), close)}
          </div>
          <div class="flex items-center gap-0 px-2 py-1">
            {iconBtn(<ArrowUp size={ICON} />, 'Shift up', () => execTransformSelection(font, shiftUp, 'Shift Up'), close)}
            {iconBtn(<ArrowDown size={ICON} />, 'Shift down', () => execTransformSelection(font, shiftDown, 'Shift Down'), close)}
            {iconBtn(<ArrowLeft size={ICON} />, 'Shift left', () => execTransformSelection(font, shiftLeft, 'Shift Left'), close)}
            {iconBtn(<ArrowRight size={ICON} />, 'Shift right', () => execTransformSelection(font, shiftRight, 'Shift Right'), close)}
            {iconBtn(<CenterHIcon size={ICON} />, 'Center horizontal', () => execTransformSelection(font, centerHorizontalBytes, 'Center H'), close)}
          </div>
          <div class="border-t border-gray-200 my-1" />
          {menuItem('Copy Upper to Lower', () => execCopyRange(font, 65, 90, 97, 'Copy Upper→Lower'), close)}
          {menuItem('Copy Lower to Upper', () => execCopyRange(font, 97, 122, 65, 'Copy Lower→Upper'), close)}
          <div class="border-t border-gray-200 my-1" />
          {menuItem('Create Bold', () => createBoldVariant(font), close)}
          {menuItem('Create Outline', () => createOutlineVariant(font), close)}
          {menuItem('Create Oblique...', () => setObliqueOpen(true), close)}
          {font.spacing.value === 'monospace' && menuItem('Create Proportional', () => createProportionalVariant(font), close)}
          {font.spacing.value === 'proportional' && menuItem('Create Monospace...', () => setMonospaceOpen(true), close)}
        </>
      )}
    </Dropdown>
  )
}
