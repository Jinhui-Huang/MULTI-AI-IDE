class EventStore:
    def __init__(self): self.events = []
    def append(self, event): self.events.append(event)
    def list_since(self, seq: int): return [e for e in self.events if e.get('seq', 0) > seq]
