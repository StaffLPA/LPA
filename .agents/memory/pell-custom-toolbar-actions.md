---
name: Pell custom toolbar actions
description: How custom announcement editor toolbar buttons must be connected in react-native-pell-rich-editor.
---

Pass each custom toolbar action as a prop whose name exactly matches the custom action string. Do not use a generic `customAction` callback; the toolbar does not invoke it.

**Why:** Custom buttons rendered normally but did nothing because `react-native-pell-rich-editor` resolves unknown actions through `this.props[action]`.

**How to apply:** Whenever adding or changing a custom Pell toolbar control, keep the action string, icon-map key, and action-named handler prop identical, then verify the handler opens or applies its control.