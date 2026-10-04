import { Link, useLocation } from 'react-router-dom';
import { Route } from 'lucide-react';
import { Card } from '../components/ui/Card.jsx';
import { EmptyState } from '../components/ui/StateView.jsx';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <Card>
      <EmptyState icon={Route} title="404: no route matches this path" action={<Link to="/">Back to the dashboard</Link>}>
        The router could not match <code>{pathname}</code> to any component.
      </EmptyState>
    </Card>
  );
}
