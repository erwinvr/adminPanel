/**
 * components/Modal.jsx
 *
 * Wrapper fino sobre el Dialog de shadcn/ui — no sabe nada de su
 * contenido. La página que lo usa controla su apertura/cierre con
 * estado propio y lo monta condicionalmente:
 *
 *   {modalOpen && <Modal title="..." onClose={() => setModalOpen(false)}>...</Modal>}
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';

export function Modal({ title, onClose, children }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
