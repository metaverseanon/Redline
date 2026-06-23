---
name: Reanimated layout-entering blanks on RN-web
description: Why Reanimated entering animations (FadeIn/FadeInDown) leave content invisible on react-native-web and how the RedLine onboarding works around it.
---

# Reanimated layout `entering` animations collapse content on react-native-web

Reanimated **layout** animations (`entering={FadeIn}`, `FadeInDown`, etc.) leave
their content stuck at `opacity:0` / zero-height on **react-native-web**, so the
element renders fully blank with **no JS error and no ErrorBoundary fallback**
(a white screen, not a crash). Nested `Animated.View` (an entering-animated view
inside another) is the worst offender and is the most likely to disappear.

Animated **style** animations (`useAnimatedStyle`) are NOT affected — those render
fine on web (they just don't animate without re-render).

**Why:** RedLine is native-only; web is only a preview stub, but we still use the
web preview to verify UI. A blank web preview was masking otherwise-correct native
screens and wasted debugging cycles chasing a phantom logic bug.

**How to apply:** Gate Reanimated entering on platform. Make the `entering` builder
return `undefined` on web (`Platform.OS === 'web' ? undefined : FadeIn...`) AND
swap the wrapper element itself to a plain `View`/`Image` on web for any
entering-animated element — especially nested ones. RedLine onboarding
(`artifacts/redline/app/onboarding.tsx`) does this via `enterFade*()` helpers plus
`AView`/`AImage` aliases (`= IS_WEB ? View/Image : Animated.View/Image`). Keep
real `Animated.View` for `useAnimatedStyle`-driven elements.

**Debugging tip:** On RN-web, white screen = zero-height/opacity (not a crash);
black-with-red-text = ErrorBoundary caught an exception. Use that to tell layout
artifacts apart from real errors.
