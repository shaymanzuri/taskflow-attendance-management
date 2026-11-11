### 1. Backend
cd backend
python -m pip install -r requirements.txt
copy .env.example .env
python app.py

### 2. Frontend (טרמינל נוסף)
```
cd frontend/src
npm install
npm run dev

## הערות
- ההרשאות נאכפות בשרת, לא רק בממשק.
- זמני כניסה ויציאה נרשמים לפי שעון השרת.
- תיקוני מפקד ברישומי נוכחות נשמרים ב-`audit_log` עם סיבה (`GET /api/audit`).
- לפני העלאה לשימוש אמיתי ביחידה, תאם עם קצין אבטחת מידע איפה מותר לארח את המערכת ואילו נתונים לאחסן.
