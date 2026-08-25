# Integration Guide: Adding New Features/Modules

This guide provides a step-by-step workflow for adding new WDK features or pages to the application. The project structure is designed to be modular, utilizing reusable UI components to ensure consistency and minimize boilerplate code.

## 1. Create a Feature Page

Create a new file in the appropriate directory under `src/app/features/`.

**Example:** `src/app/features/wallet/my-new-feature.tsx`

### Basic Template

Use the `FeatureLayout` and `ConsoleOutput` components to quickly scaffold a functional page with built-in logging capabilities.

```tsx
import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { ActionCard } from '@/components/ActionCard';
import { colors } from '@/constants/colors';

// Import your WDK hooks or logic here
// import { useMyWdkHook } from '@tetherto/wdk-react-native-core';

export default function MyNewFeatureScreen() {
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (params: any) => {
    setIsLoading(true);
    try {
      // Perform your logic here
      const data = { status: 'success', ...params }; // Mock result
      setResult(data);
      return data;
    } catch (error: any) {
      setResult(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <FeatureLayout 
      title="My New Feature" 
      description="Brief description of what this feature does."
    >
      {/* 1. Input/Action Section */}
      <ActionCard
        title="Execute Action"
        description="Trigger the feature logic."
        fields={[
           // Define input fields if needed
          { id: 'param1', type: 'text', label: 'Parameter 1' },
        ]}
        action={handleAction}
        actionLabel="Run Feature"
      />

      {/* 2. Output/Logging Section */}
      <View style={styles.section}>
        <ConsoleOutput 
          title="Results"
          data={result || 'No data generated yet.'} 
          // Use 'error' prop to style as error if needed:
          // error={result instanceof Error}
        />
      </View>

      {/* Optional: Loading State */}
      {isLoading && (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      )}
    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
});
```

## 2. Reusable Components Overview

### `FeatureLayout`
**Path:** `src/components/FeatureLayout.tsx`

Wraps every feature page. It automatically handles:
- Safe Area insets (status bar handling)
- Navigation header with a back button
- Consistent padding and styling
- ScrollView for content

**Props:**
- `title` (string): The page title displayed in the header.
- `description` (string, optional): A subtitle/description displayed at the top of the content.

### `ConsoleOutput`
**Path:** `src/components/ConsoleOutput.tsx`

Displays data (objects, arrays, strings) in a developer-friendly format, similar to a terminal output.

**Features:**
- JSON formatting for objects/arrays.
- distinct styling for errors.
- "Copy to Clipboard" functionality (implied or commonly added).

**Props:**
- `data` (any): The content to display.
- `title` (string, optional): A label for the output block.
- `error` (boolean, optional): If true, styles the text in red to indicate an error.

### `ActionCard`
**Path:** `src/components/ActionCard.tsx`

A card component designed to capture user input and trigger an async action.

**Props:**
- `title` (string): Card title.
- `description` (string): Card description.
- `fields` (Array): Configuration for input fields (text, select, etc.).
- `action` (Function): Async function triggered on button press. Receives field values as an argument.
- `actionLabel` (string): Text for the action button.

## 3. Register the Route

Once your page is created, add it to the main navigation menu in `src/app/index.tsx`.

1.  Open `src/app/index.tsx`.
2.  Find the `FeatureGroup` that fits your feature (or create a new one).
3.  Add a `FeatureItem` pointing to your new file path (relative to `src/app`).

```tsx
<FeatureGroup 
  title="My New Group" 
  icon={<SomeIcon size={20} color={colors.primary} />}
>
  <FeatureItem 
    title="My Feature" 
    route="/features/wallet/my-new-feature" 
  />
</FeatureGroup>
```

**Note:** The `route` prop corresponds to the file structure within `src/app`. `src/app/features/wallet/my-new-feature.tsx` becomes `/features/wallet/my-new-feature`.

## 4. Configuration (Optional)

If your feature requires new chain or token configurations, edit:
- `src/config/chain.ts`
- `src/config/token.ts`

These changes will be automatically reflected if you use the shared configuration hooks.
