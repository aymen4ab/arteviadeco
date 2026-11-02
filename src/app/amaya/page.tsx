import { AmayaHud } from '@/components/amaya/amaya-hud'
import { amayaDisplay } from './fonts'

export default function AmayaPage() {
  return <AmayaHud displayFont={amayaDisplay.style.fontFamily} />
}
