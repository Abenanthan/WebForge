import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextField } from '../../components/ui/TextField.jsx';
import { Button } from '../../components/ui/Button.jsx';

/** TextField with a show/hide toggle. */
export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      type={visible ? 'text' : 'password'}
      adornment={(
        <Button
          variant="ghost"
          size="sm"
          icon={visible ? EyeOff : Eye}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        />
      )}
      {...props}
    />
  );
});
