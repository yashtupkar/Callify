import { useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';

const PHONE_API = 'http://localhost:8083/api/phonenumbers';

export default function PhoneNumberModal({ open, onClose, phoneNumbers, agents, onRefresh }) {
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    if (!newPhoneNumber.trim()) return;
    setAddError('');
    try {
      await axios.post(PHONE_API, { phoneNumber: newPhoneNumber.trim() });
      setNewPhoneNumber('');
      onRefresh();
    } catch (err) {
      setAddError('Failed to add number (it may already exist).');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${PHONE_API}/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete phone number', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card text-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Phone Numbers</DialogTitle>
        </DialogHeader>

        {/* Add new number */}
        <div className="space-y-2 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="+1234567890"
              value={newPhoneNumber}
              onChange={e => setNewPhoneNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="bg-background"
            />
            <Button onClick={handleAdd} disabled={!newPhoneNumber.trim()}>Add</Button>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
        </div>

        {/* Phone number list */}
        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {phoneNumbers.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No numbers added yet.</p>
          ) : (
            phoneNumbers.map(phone => {
              const assignedAgent = agents.find(a => a.id === phone.agentId);
              return (
                <div
                  key={phone.id}
                  className="flex justify-between items-center p-2 rounded-md bg-zinc-900/50 border border-border"
                >
                  <div>
                    <p className="font-mono text-sm">{phone.phoneNumber}</p>
                    <p className="text-xs text-zinc-500">
                      {assignedAgent ? `Assigned to: ${assignedAgent.name}` : 'Unassigned'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(phone.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
