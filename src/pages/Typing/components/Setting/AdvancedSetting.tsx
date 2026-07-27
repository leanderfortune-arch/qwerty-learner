import styles from './index.module.css'
import {
  continuousModeConfigAtom,
  isIgnoreCaseAtom,
  isImmersiveModeAtom,
  isMiniWindowModeAtom,
  isShowAnswerOnHoverAtom,
  isShowPrevAndNextWordAtom,
  isTextSelectableAtom,
  miniWindowOpacityAtom,
  randomConfigAtom,
} from '@/store'
import { IS_DESKTOP, PANIC_KEY_SHORTCUT, enterMiniWindow, exitMiniWindow, setMiniWindowOpacity } from '@/utils/desktop'
import { Switch } from '@headlessui/react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import * as Slider from '@radix-ui/react-slider'
import { useAtom } from 'jotai'
import { useCallback } from 'react'

export default function AdvancedSetting() {
  const [randomConfig, setRandomConfig] = useAtom(randomConfigAtom)
  const [isShowPrevAndNextWord, setIsShowPrevAndNextWord] = useAtom(isShowPrevAndNextWordAtom)
  const [isIgnoreCase, setIsIgnoreCase] = useAtom(isIgnoreCaseAtom)
  const [isTextSelectable, setIsTextSelectable] = useAtom(isTextSelectableAtom)
  const [isShowAnswerOnHover, setIsShowAnswerOnHover] = useAtom(isShowAnswerOnHoverAtom)
  const [continuousModeConfig, setContinuousModeConfig] = useAtom(continuousModeConfigAtom)
  const [isImmersiveMode, setIsImmersiveMode] = useAtom(isImmersiveModeAtom)
  const [isMiniWindowMode, setIsMiniWindowMode] = useAtom(isMiniWindowModeAtom)
  const [miniWindowOpacity, setMiniWindowOpacityValue] = useAtom(miniWindowOpacityAtom)

  const onToggleRandom = useCallback(
    (checked: boolean) => {
      setRandomConfig((prev) => ({
        ...prev,
        isOpen: checked,
      }))
    },
    [setRandomConfig],
  )

  const onToggleMiniWindowMode = useCallback(
    (checked: boolean) => {
      setIsMiniWindowMode(checked)
      // 窗口尺寸的实际调整交给 Tauri，失败时回滚开关，避免状态与窗口不一致。
      const apply = checked ? () => enterMiniWindow(miniWindowOpacity) : exitMiniWindow
      apply().catch(() => setIsMiniWindowMode(!checked))
    },
    [setIsMiniWindowMode, miniWindowOpacity],
  )

  const onChangeMiniWindowOpacity = useCallback(
    (value: [number]) => {
      const next = value[0] / 100
      setMiniWindowOpacityValue(next)
      // 拖动时即时生效，方便边看边调。
      setMiniWindowOpacity(next).catch(() => undefined)
    },
    [setMiniWindowOpacityValue],
  )

  const onToggleImmersiveMode = useCallback(
    (checked: boolean) => {
      setIsImmersiveMode(checked)
    },
    [setIsImmersiveMode],
  )

  const onToggleContinuousMode = useCallback(
    (checked: boolean) => {
      setContinuousModeConfig((prev) => ({
        ...prev,
        isOpen: checked,
      }))
    },
    [setContinuousModeConfig],
  )

  const onToggleLastAndNextWord = useCallback(
    (checked: boolean) => {
      setIsShowPrevAndNextWord(checked)
    },
    [setIsShowPrevAndNextWord],
  )

  const onToggleIgnoreCase = useCallback(
    (checked: boolean) => {
      setIsIgnoreCase(checked)
    },
    [setIsIgnoreCase],
  )

  const onToggleTextSelectable = useCallback(
    (checked: boolean) => {
      setIsTextSelectable(checked)
    },
    [setIsTextSelectable],
  )
  const onToggleShowAnswerOnHover = useCallback(
    (checked: boolean) => {
      setIsShowAnswerOnHover(checked)
    },
    [setIsShowAnswerOnHover],
  )

  return (
    <ScrollArea.Root className="flex-1 select-none overflow-y-auto ">
      <ScrollArea.Viewport className="h-full w-full px-3">
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>章节乱序</span>
            <span className={styles.sectionDescription}>开启后，每次练习章节中单词会随机排序。下一章节生效</span>
            <div className={styles.switchBlock}>
              <Switch checked={randomConfig.isOpen} onChange={onToggleRandom} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`随机已${
                randomConfig.isOpen ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
          {IS_DESKTOP && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>摸鱼模式</span>
              <span className={styles.sectionDescription}>
                把窗口缩成置顶小窗，叠在其他应用上练习。该尺寸下自动使用沉浸布局，窗口位置会被记住。 开启期间可用{' '}
                {PANIC_KEY_SHORTCUT.replace('CommandOrControl', '⌘').replace('Alt', '⌥').replace(/\+/g, '')} 一键隐藏/唤回。
                想打字时先点一下小窗使其获得焦点
              </span>
              <div className={styles.switchBlock}>
                <Switch checked={isMiniWindowMode} onChange={onToggleMiniWindowMode} className="switch-root">
                  <span aria-hidden="true" className="switch-thumb" />
                </Switch>
                <span className="text-right text-xs font-normal leading-tight text-gray-600">{`摸鱼模式已${
                  isMiniWindowMode ? '开启' : '关闭'
                }`}</span>
              </div>
              {isMiniWindowMode && (
                <div className={styles.block}>
                  <span className={styles.blockLabel}>整窗不透明度</span>
                  <div className="flex h-5 w-full items-center justify-between">
                    <Slider.Root
                      defaultValue={[miniWindowOpacity * 100]}
                      max={100}
                      min={30}
                      step={5}
                      className="slider"
                      onValueChange={onChangeMiniWindowOpacity}
                    >
                      <Slider.Track>
                        <Slider.Range />
                      </Slider.Track>
                      <Slider.Thumb />
                    </Slider.Root>
                    <span className="ml-4 w-10 text-xs font-normal text-gray-600">{`${Math.round(miniWindowOpacity * 100)}%`}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>沉浸模式</span>
            <span className={styles.sectionDescription}>练习时隐藏顶栏、统计与页脚，只保留单词。鼠标移到窗口顶部可临时唤出顶栏</span>
            <div className={styles.switchBlock}>
              <Switch checked={isImmersiveMode} onChange={onToggleImmersiveMode} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`沉浸模式已${
                isImmersiveMode ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>连续练习</span>
            <span className={styles.sectionDescription}>开启后，练完一章不再弹出结算页，直接进入下一章；练完最后一章会回到第一章</span>
            <div className={styles.switchBlock}>
              <Switch checked={continuousModeConfig.isOpen} onChange={onToggleContinuousMode} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`连续练习已${
                continuousModeConfig.isOpen ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>练习时展示上一个/下一个单词</span>
            <span className={styles.sectionDescription}>开启后，练习中会在上方展示上一个/下一个单词</span>
            <div className={styles.switchBlock}>
              <Switch checked={isShowPrevAndNextWord} onChange={onToggleLastAndNextWord} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`展示单词已${
                isShowPrevAndNextWord ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>是否忽略大小写</span>
            <span className={styles.sectionDescription}>开启后，输入时不区分大小写，如输入“hello”和“Hello”都会被认为是正确的</span>
            <div className={styles.switchBlock}>
              <Switch checked={isIgnoreCase} onChange={onToggleIgnoreCase} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`忽略大小写已${
                isIgnoreCase ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>是否允许选择文本</span>
            <span className={styles.sectionDescription}>开启后，可以通过鼠标选择文本 </span>
            <div className={styles.switchBlock}>
              <Switch checked={isTextSelectable} onChange={onToggleTextSelectable} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`选择文本已${
                isTextSelectable ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>是否允许默写模式下显示提示</span>
            <span className={styles.sectionDescription}>开启后，可以通过鼠标 hover 单词显示正确答案 </span>
            <div className={styles.switchBlock}>
              <Switch checked={isShowAnswerOnHover} onChange={onToggleShowAnswerOnHover} className="switch-root">
                <span aria-hidden="true" className="switch-thumb" />
              </Switch>
              <span className="text-right text-xs font-normal leading-tight text-gray-600">{`显示提示已${
                isShowAnswerOnHover ? '开启' : '关闭'
              }`}</span>
            </div>
          </div>
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="flex touch-none select-none bg-transparent " orientation="vertical"></ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
