import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, TextInput, Text, StyleSheet, Platform, Modal, Alert } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let NativeRichEditor: any;
let NativeRichToolbar: any;
let nativeActions: any;

if (Platform.OS !== 'web') {
  const pell = require('react-native-pell-rich-editor');
  NativeRichEditor = pell.RichEditor;
  NativeRichToolbar = pell.RichToolbar;
  nativeActions = pell.actions;
}

const COLORS = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
const FONTS = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana'];
const SIZES = [
  { label: 'Small', val: '2' },
  { label: 'Normal', val: '3' },
  { label: 'Large', val: '5' },
  { label: 'Huge', val: '7' },
];

export interface RichTextEditorRef {
  getContentHtml: () => Promise<string>;
  setContentHTML: (html: string) => void;
}

interface RichTextEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  editorRef?: React.MutableRefObject<RichTextEditorRef | null>;
  formKey?: number;
}

export function RichTextEditor({ initialContent, onChange, editorRef, formKey }: RichTextEditorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  
  const nativeEditorRef = useRef<any>(null);
  const webDivRef = useRef<any>(null);
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);

  const [linkModal, setLinkModal] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  
  const [colorModal, setColorModal] = useState(false);
  const [colorType, setColorType] = useState<'fore' | 'bg'>('fore');
  const [customHex, setCustomHex] = useState('');
  
  const [fontModal, setFontModal] = useState(false);
  const [sizeModal, setSizeModal] = useState(false);

  useEffect(() => {
    if (editorRef) {
      editorRef.current = {
        getContentHtml: async () => {
          if (Platform.OS === 'web') return webDivRef.current?.innerHTML || '';
          return await nativeEditorRef.current?.getContentHtml() || '';
        },
        setContentHTML: (html: string) => {
          if (Platform.OS === 'web') {
             if (webDivRef.current) webDivRef.current.innerHTML = html;
          } else {
             nativeEditorRef.current?.setContentHTML(html);
          }
        }
      };
    }
  }, [editorRef]);

  const validateUrl = (url: string) => {
    let testUrl = url.trim();
    if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://') && !testUrl.startsWith('mailto:')) {
      testUrl = 'https://' + testUrl;
    }
    try {
      const parsed = new URL(testUrl);
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        return parsed.href;
      }
    } catch (e) {}
    return null;
  };

  const saveWebSelection = () => {
    if (Platform.OS === 'web') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        setSavedSelection(sel.getRangeAt(0));
      }
    }
  };

  const restoreWebSelection = () => {
    if (Platform.OS === 'web' && savedSelection) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedSelection);
    }
  };

  const openColorModal = (type: 'fore' | 'bg') => {
    saveWebSelection();
    setColorType(type);
    setCustomHex('');
    setColorModal(true);
  };

  const applyColor = (value: string) => {
    const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    if (!/^#[0-9a-f]{6}$/i.test(normalized) && !/^#[0-9a-f]{3}$/i.test(normalized)) {
      Alert.alert('Invalid hex color', 'Enter a 3- or 6-digit hex color, such as #B45A2A.');
      return;
    }
    exec(colorType === 'fore' ? 'foreColor' : 'hiliteColor', normalized);
    setColorModal(false);
  };

  const exec = (cmd: string, val?: string) => {
    if (Platform.OS === 'web') {
      restoreWebSelection();
      document.execCommand(cmd, false, val);
      webDivRef.current?.focus();
      onChange?.(webDivRef.current?.innerHTML || '');
    } else {
      if (cmd === 'unlink') {
        nativeEditorRef.current?.commandDOM('document.execCommand("unlink")');
      } else if (cmd === 'foreColor') {
        nativeEditorRef.current?.commandDOM(`document.execCommand("foreColor", false, "${val}")`);
      } else if (cmd === 'hiliteColor') {
        nativeEditorRef.current?.commandDOM(`document.execCommand("hiliteColor", false, "${val}")`);
      } else if (cmd === 'fontName') {
        nativeEditorRef.current?.commandDOM(`document.execCommand("fontName", false, "${val}")`);
      } else if (cmd === 'fontSize') {
        nativeEditorRef.current?.commandDOM(`document.execCommand("fontSize", false, "${val}")`);
      }
    }
  };

  const handleLink = () => {
    const validUrl = validateUrl(linkUrl);
    if (!validUrl) {
      alert('Please enter a valid URL (http, https, or mailto).');
      return;
    }

    if (Platform.OS === 'web') {
      restoreWebSelection();
      let node = window.getSelection()?.anchorNode;
      while (node && node.nodeName !== 'A' && node !== webDivRef.current) {
        node = node.parentNode;
      }
      if (node && node.nodeName === 'A') {
        (node as HTMLAnchorElement).href = validUrl;
        if (linkTitle.trim()) (node as HTMLAnchorElement).innerText = linkTitle.trim();
      } else {
        if (linkTitle.trim() && window.getSelection()?.isCollapsed) {
          const textNode = document.createTextNode(linkTitle.trim());
          const range = window.getSelection()?.getRangeAt(0);
          range?.insertNode(textNode);
          range?.selectNode(textNode);
        }
        document.execCommand('createLink', false, validUrl);
      }
      webDivRef.current?.focus();
      onChange?.(webDivRef.current?.innerHTML || '');
    } else {
      const safeUrl = JSON.stringify(validUrl);
      const safeTitle = JSON.stringify(linkTitle.trim());
      const script = `
        (function() {
          var sel = window.getSelection();
          if (!sel.rangeCount) return;
          var node = sel.anchorNode;
          while (node && node.nodeName !== 'A' && node.nodeName !== 'BODY') {
              node = node.parentNode;
          }
          if (node && node.nodeName === 'A') {
              node.href = ${safeUrl};
              if (${safeTitle}) {
                  node.innerText = ${safeTitle};
              }
          } else {
              if (${safeTitle} && sel.isCollapsed) {
                  var textNode = document.createTextNode(${safeTitle});
                  var range = sel.getRangeAt(0);
                  range.insertNode(textNode);
                  range.selectNode(textNode);
              }
              document.execCommand('createLink', false, ${safeUrl});
          }
        })();
      `;
      nativeEditorRef.current?.commandDOM(script);
    }
    setLinkModal(false);
  };

  const handleUnlink = () => {
    if (Platform.OS === 'web') {
      restoreWebSelection();
      document.execCommand('unlink', false, undefined);
      webDivRef.current?.focus();
      onChange?.(webDivRef.current?.innerHTML || '');
    } else {
      nativeEditorRef.current?.commandDOM('document.execCommand("unlink")');
    }
    setLinkModal(false);
  };

  const Modals = () => (
    <>
      <Modal visible={linkModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Insert / Edit Link</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12, fontFamily: 'Inter_400Regular' }}>Select an existing link in the editor to edit or remove it.</Text>
            <TextInput testID="editor-link-title" value={linkTitle} onChangeText={setLinkTitle} placeholder="Text to display" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <TextInput testID="editor-link-url" value={linkUrl} onChangeText={setLinkUrl} placeholder="URL (https://...)" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
            <View style={styles.modalActions}>
              <Pressable testID="editor-link-cancel" style={styles.modalBtn} onPress={() => setLinkModal(false)}><Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text></Pressable>
              <Pressable testID="editor-link-remove" style={styles.modalBtn} onPress={handleUnlink}><Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold' }}>Remove</Text></Pressable>
              <Pressable testID="editor-link-insert" style={[styles.modalBtn, { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12 }]} onPress={handleLink}><Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Insert</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={colorModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{colorType === 'fore' ? 'Text Color' : 'Highlight Color'}</Text>
            <View style={styles.colorGrid}>
              {COLORS.map(c => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use color ${c}`}
                  testID={`editor-color-${c}`}
                  key={c}
                  onPress={() => applyColor(c)}
                  style={[styles.colorSwatch, { backgroundColor: c, borderWidth: c === '#ffffff' ? 1 : 0, borderColor: colors.border }]}
                />
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Custom hex color</Text>
            <View style={styles.hexRow}>
              <View
                accessibilityLabel="Custom color preview"
                style={[
                  styles.hexPreview,
                  {
                    borderColor: colors.border,
                    backgroundColor: /^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(customHex.trim())
                      ? (customHex.trim().startsWith('#') ? customHex.trim() : `#${customHex.trim()}`)
                      : colors.background,
                  },
                ]}
              />
              <TextInput
                testID="editor-color-hex-input"
                accessibilityLabel="Hex color"
                value={customHex}
                onChangeText={setCustomHex}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                placeholder="#B45A2A"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.hexInput, { color: colors.foreground, borderColor: colors.border }]}
                onSubmitEditing={() => applyColor(customHex)}
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable
                testID="editor-color-cancel"
                accessibilityRole="button"
                style={styles.modalBtn}
                onPress={() => setColorModal(false)}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="editor-color-apply"
                accessibilityRole="button"
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14 }]}
                onPress={() => applyColor(customHex)}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      
      <Modal visible={fontModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setFontModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Font Family</Text>
            {FONTS.map(f => (
              <Pressable testID={`editor-font-${f.replace(/\s+/g, '-')}`} key={f} onPress={() => { exec('fontName', f); setFontModal(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontFamily: 'Inter_500Medium', color: colors.foreground, fontSize: 16 }}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={sizeModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSizeModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Font Size</Text>
            {SIZES.map(s => (
              <Pressable testID={`editor-size-${s.val}`} key={s.val} onPress={() => { exec('fontSize', s.val); setSizeModal(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontFamily: 'Inter_500Medium', color: colors.foreground, fontSize: 16 }}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );

  if (Platform.OS === 'web') {
    const webBtn = (icon: any, cmd: string, val?: string) => (
      <Pressable testID={`editor-btn-${cmd}`} onPress={() => exec(cmd, val)} style={styles.webBtn}>
        {icon}
      </Pressable>
    );
    const textIcon = (char: string) => <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{char}</Text>;
    return (
      <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Modals />
        <View style={[styles.webToolbar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          {webBtn(<Text style={{fontFamily: 'Inter_700Bold', color: colors.foreground}}>B</Text>, 'bold')}
          {webBtn(<Text style={{fontStyle:'italic', color: colors.foreground, fontWeight: 'bold'}}>I</Text>, 'italic')}
          {webBtn(<Text style={{textDecorationLine:'underline', color: colors.foreground, fontWeight: 'bold'}}>U</Text>, 'underline')}
          {webBtn(<Text style={{textDecorationLine:'line-through', color: colors.foreground, fontWeight: 'bold'}}>S</Text>, 'strikeThrough')}
          
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />
          {webBtn(<Feather name="menu" size={16} color={colors.foreground} />, 'insertUnorderedList')}
          {webBtn(<Feather name="layout" size={16} color={colors.foreground} />, 'insertOrderedList')}
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />
          
          {webBtn(<Feather name="menu" size={16} color={colors.foreground} />, 'justifyLeft')}
          {webBtn(<Feather name="menu" size={16} color={colors.foreground} />, 'justifyCenter')}
          {webBtn(<Feather name="menu" size={16} color={colors.foreground} />, 'justifyRight')}
          {webBtn(<Feather name="menu" size={16} color={colors.foreground} />, 'justifyFull')}
          
          <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />
          <Pressable testID="editor-btn-link" onPress={() => { 
            setLinkTitle(''); 
            setLinkUrl(''); 
            
            saveWebSelection();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                let node = sel.anchorNode;
                while (node && node.nodeName !== 'A' && node !== webDivRef.current) {
                    node = node.parentNode;
                }
                if (node && node.nodeName === 'A') {
                    setLinkUrl((node as HTMLAnchorElement).href);
                    setLinkTitle((node as HTMLAnchorElement).innerText);
                }
            }
            setLinkModal(true); 
          }} style={styles.webBtn}>
             <Feather name="external-link" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable testID="editor-btn-forecolor" onPress={() => openColorModal('fore')} style={styles.webBtn}>
             <Feather name="edit-3" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable testID="editor-btn-bgcolor" onPress={() => openColorModal('bg')} style={styles.webBtn}>
             <Feather name="edit-2" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable testID="editor-btn-font" onPress={() => { saveWebSelection(); setFontModal(true); }} style={styles.webBtn}>
             {textIcon('F')}
          </Pressable>
          <Pressable testID="editor-btn-size" onPress={() => { saveWebSelection(); setSizeModal(true); }} style={styles.webBtn}>
             {textIcon('T')}
          </Pressable>
        </View>
        <div
          ref={webDivRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onChange?.(e.currentTarget.innerHTML)}
          onBlur={(e) => onChange?.(e.currentTarget.innerHTML)}
          style={{ flex: 1, minHeight: 200, padding: 12, outline: 'none', color: colors.foreground, fontFamily: 'sans-serif' }}
          dangerouslySetInnerHTML={{ __html: initialContent || '' }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Modals />
      <NativeRichToolbar
        editor={nativeEditorRef}
        actions={[
          nativeActions.setBold, nativeActions.setItalic, nativeActions.setUnderline, nativeActions.setStrikethrough,
          nativeActions.insertBulletsList, nativeActions.insertOrderedList,
          nativeActions.alignLeft, nativeActions.alignCenter, nativeActions.alignRight, nativeActions.alignFull,
          'customLink', 'customColor', 'customBgColor', 'customFontFamily', 'customFontSize'
        ]}
        iconMap={{
          customLink: () => <Feather name="external-link" size={18} color={colors.foreground} />,
          customColor: () => <Feather name="edit-3" size={18} color={colors.foreground} />,
          customBgColor: () => <Feather name="edit-2" size={18} color={colors.foreground} />,
          customFontFamily: () => <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground, fontSize: 16 }}>F</Text>,
          customFontSize: () => <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground, fontSize: 16 }}>T</Text>,
        }}
        customLink={() => { setLinkTitle(''); setLinkUrl(''); setLinkModal(true); }}
        customColor={() => openColorModal('fore')}
        customBgColor={() => openColorModal('bg')}
        customFontFamily={() => setFontModal(true)}
        customFontSize={() => setSizeModal(true)}
        iconTint={colors.foreground}
        selectedIconTint={colors.primary}
        style={[styles.nativeToolbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
      />
      <NativeRichEditor
        key={formKey}
        ref={nativeEditorRef}
        initialContentHTML={initialContent}
        onChange={onChange}
        placeholder="Write the announcement here..."
        useContainer={false}
        editorStyle={{
          backgroundColor: colors.background,
          color: colors.foreground,
          placeholderColor: colors.mutedForeground,
          contentCSSText: `font-family: sans-serif; font-size: 16px;`
        }}
        style={styles.editor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 200,
    marginBottom: 14,
  },
  webToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderBottomWidth: 1,
    padding: 8,
    gap: 4,
    alignItems: 'center',
  },
  webBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  nativeToolbar: {
    borderBottomWidth: 1,
  },
  editor: {
    flex: 1,
    minHeight: 150,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginBottom: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    marginBottom: 8,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hexPreview: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  hexInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontFamily: 'Inter_400Regular',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  }
});
