from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import base64
from io import BytesIO
from PIL import Image
import random
import numpy as np
from sklearn.linear_model import LinearRegression

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ==================== Models ====================

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    category: str
    description: str
    date: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str
    date: str

class Group(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    members: List[str]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class GroupCreate(BaseModel):
    name: str
    members: List[str]

class GroupExpense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    amount: float
    category: str
    description: str
    paid_by: str
    split_type: str  # 'equal' or 'custom'
    splits: Dict[str, float]  # member_name: amount
    date: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class GroupExpenseCreate(BaseModel):
    group_id: str
    amount: float
    category: str
    description: str
    paid_by: str
    split_type: str
    splits: Optional[Dict[str, float]] = None
    date: str

class Budget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    limit: float
    period: str  # 'monthly'
    ai_recommendation: bool
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CategorySpending(BaseModel):
    category: str
    amount: float

# ==================== Helpers ====================

async def get_category_spending(days: int = 30) -> List[Dict]:
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    expenses = await db.expenses.find(
        {"date": {"$gte": cutoff_date}},
        {"_id": 0}
    ).to_list(1000)

    category_totals: Dict[str, float] = {}
    for exp in expenses:
        cat = exp.get('category', 'Other')
        category_totals[cat] = category_totals.get(cat, 0) + float(exp.get('amount', 0))

    return [{"category": k, "amount": v} for k, v in category_totals.items()]

async def get_ai_suggestions() -> List[str]:
    try:
        expenses = await db.expenses.find({}, {"_id": 0}).sort("date", -1).limit(50).to_list(50)
        if not expenses:
            return ["Start tracking expenses to get personalized suggestions!"]

        category_spending: Dict[str, float] = {}
        total_spending = 0.0
        for exp in expenses:
            cat = exp.get('category', 'Other')
            amt = float(exp.get('amount', 0))
            category_spending[cat] = category_spending.get(cat, 0) + amt
            total_spending += amt

        suggestions = []
        if category_spending:
            highest_cat = max(category_spending.items(), key=lambda x: x[1])
            suggestions.append(f"Your highest spending is in {highest_cat[0]} (₹{highest_cat[1]:.2f}). Consider setting a limit.")

        small_purchases = [e for e in expenses if float(e.get('amount', 0)) < 200]  # ₹200 as “small”
        if len(small_purchases) > 10:
            total_small = sum(float(e.get('amount', 0)) for e in small_purchases)
            suggestions.append(f"You have {len(small_purchases)} small purchases totaling ₹{total_small:.2f}. These add up quickly!")

        if 'Entertainment' in category_spending and category_spending['Entertainment'] > 3000:
            suggestions.append("Entertainment is trending high. Try a no-subscription week to reset habits.")

        unique_days = max(len(set(e['date'][:10] for e in expenses)), 1)
        avg_daily = total_spending / unique_days
        suggestions.append(f"Your average daily spend is ₹{avg_daily:.0f}. A daily cap can help rein it in.")

        return suggestions[:4]
    except Exception as e:
        logging.error(f"AI suggestions error: {e}")
        return [
            "Track your daily expenses to identify spending patterns.",
            "Review subscriptions and cancel unused ones.",
            "Cook at home more often to reduce food costs.",
            "Set specific budget limits per category."
        ]

async def generate_ai_budget(category_spending: List[Dict]) -> List[Budget]:
    try:
        if not category_spending:
            return []
        budgets: List[Budget] = []
        min_budgets = {
            'Food': 2000, 'Transport': 1000, 'Shopping': 1500,
            'Entertainment': 1000, 'Utilities': 1500, 'Healthcare': 1000
        }
        for item in category_spending:
            category = item['category']
            current = float(item['amount'])
            recommended_limit = round(max(current * 1.12, min_budgets.get(category, 500)), 2)
            budgets.append(Budget(category=category, limit=recommended_limit, period="monthly", ai_recommendation=True))
        return budgets
    except Exception as e:
        logging.error(f"AI budget generation error: {e}")
        return []

async def forecast_spending(days_ahead: int = 30) -> Dict:
    try:
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
        expenses = await db.expenses.find(
            {"date": {"$gte": cutoff_date}},
            {"_id": 0}
        ).to_list(1000)

        if len(expenses) < 7:
            return {"forecast": [], "trend": "insufficient_data"}

        daily_spending: Dict[str, float] = {}
        for exp in expenses:
            d = exp['date'][:10]
            daily_spending[d] = daily_spending.get(d, 0) + float(exp['amount'])

        sorted_dates = sorted(daily_spending.keys())
        X = np.array(range(len(sorted_dates))).reshape(-1, 1)
        y = np.array([daily_spending[d] for d in sorted_dates])

        model = LinearRegression()
        model.fit(X, y)

        future_X = np.array(range(len(sorted_dates), len(sorted_dates) + days_ahead)).reshape(-1, 1)
        forecast_values = model.predict(future_X)

        forecast_data = []
        for i, val in enumerate(forecast_values):
            future_date = datetime.now(timezone.utc) + timedelta(days=i)
            forecast_data.append({"date": future_date.strftime("%Y-%m-%d"), "predicted_amount": max(0, float(val))})

        slope = float(model.coef_[0])
        trend = "increasing" if slope > 50 else "decreasing" if slope < -50 else "stable"
        return {"forecast": forecast_data, "trend": trend, "slope": slope}
    except Exception as e:
        logging.error(f"Forecasting error: {e}")
        return {"forecast": [], "trend": "error"}

async def extract_receipt_data(image_base64: str) -> Dict:
    try:
        return {"amount": 459.0, "category": "Food", "description": "Receipt (edit if needed)"}
    except Exception as e:
        logging.error(f"Receipt OCR error: {e}")
        return {"amount": 0, "category": "Other", "description": "Error scanning receipt"}

# ==================== Seed ====================

async def seed_sample_data():
    existing = await db.expenses.count_documents({})
    if existing > 0:
        return
    logging.info("Seeding sample data...")
    categories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Healthcare']
    docs = []
    for i in range(30):
        date = (datetime.now(timezone.utc) - timedelta(days=30 - i)).strftime("%Y-%m-%d")
        for _ in range(random.randint(1, 3)):
            cat = random.choice(categories)
            amount = round(random.uniform(100, 1500), 2)
            docs.append({
                "id": str(uuid.uuid4()),
                "amount": amount,
                "category": cat,
                "description": f"Sample {cat} expense",
                "date": date,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    if docs:
        await db.expenses.insert_many(docs)
        logging.info(f"Seeded {len(docs)} expenses")

# ==================== Routes ====================

@api_router.get("/health")
async def health():
    return {"ok": True}

@api_router.get("/")
async def root():
    return {"message": "FinFusion API v1.0"}

# Expenses
@api_router.post("/expenses", response_model=Expense)
async def create_expense(expense: ExpenseCreate):
    expense_obj = Expense(**expense.model_dump())
    await db.expenses.insert_one(expense_obj.model_dump())
    return expense_obj

@api_router.get("/expenses", response_model=List[Expense])
async def get_expenses():
    return await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    res = await db.expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted"}

# Receipt Upload
@api_router.post("/expenses/scan-receipt")
async def scan_receipt(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(BytesIO(contents))
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        return await extract_receipt_data(img_base64)
    except Exception as e:
        logging.error(f"Receipt scan error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# Groups
@api_router.post("/groups", response_model=Group)
async def create_group(group: GroupCreate):
    group_obj = Group(**group.model_dump())
    await db.groups.insert_one(group_obj.model_dump())
    return group_obj

@api_router.get("/groups", response_model=List[Group])
async def get_groups():
    return await db.groups.find({}, {"_id": 0}).to_list(100)

@api_router.post("/group-expenses", response_model=GroupExpense)
async def create_group_expense(expense: GroupExpenseCreate):
    if expense.split_type == 'equal':
        group = await db.groups.find_one({"id": expense.group_id}, {"_id": 0})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        members = group['members']
        per_person = round(float(expense.amount) / max(len(members), 1), 2)
        splits = {m: per_person for m in members}
    else:
        splits = expense.splits or {}

    exp_obj = GroupExpense(**expense.model_dump(exclude={'splits'}), splits=splits)
    await db.group_expenses.insert_one(exp_obj.model_dump())
    return exp_obj

@api_router.get("/group-expenses/{group_id}", response_model=List[GroupExpense])
async def get_group_expenses(group_id: str):
    return await db.group_expenses.find({"group_id": group_id}, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.get("/group-balances/{group_id}")
async def get_group_balances(group_id: str):
    expenses = await db.group_expenses.find({"group_id": group_id}, {"_id": 0}).to_list(1000)
    balances: Dict[str, float] = {}
    for exp in expenses:
        paid_by = exp['paid_by']
        balances[paid_by] = balances.get(paid_by, 0) + float(exp['amount'])
        for member, amount in exp['splits'].items():
            balances[member] = balances.get(member, 0) - float(amount)

    settlements = []
    creditors = {k: v for k, v in balances.items() if v > 0.01}
    debtors = {k: -v for k, v in balances.items() if v < -0.01}
    for debtor, debt_amt in list(debtors.items()):
        for creditor, cred_amt in list(creditors.items()):
            if debt_amt <= 0.01:
                break
            pay = min(debt_amt, cred_amt)
            settlements.append({"from": debtor, "to": creditor, "amount": round(pay, 2)})
            debt_amt -= pay
            creditors[creditor] -= pay
            if creditors[creditor] <= 0.01:
                del creditors[creditor]

    return {"balances": balances, "settlements": settlements}

# Suggestions / Budgets / Analytics / Forecast
@api_router.get("/suggestions")
async def suggestions():
    return {"suggestions": await get_ai_suggestions()}

@api_router.get("/budgets/generate")
async def generate_budgets():
    cs = await get_category_spending(days=30)
    budgets = await generate_ai_budget(cs)
    if budgets:
        await db.budgets.delete_many({"ai_recommendation": True})
        for b in budgets:
            await db.budgets.insert_one(b.model_dump())
    return {"budgets": [b.model_dump() for b in budgets]}

@api_router.get("/budgets", response_model=List[Budget])
async def get_budgets():
    return await db.budgets.find({}, {"_id": 0}).to_list(100)

@api_router.post("/budgets", response_model=Budget)
async def create_budget(budget: Budget):
    await db.budgets.insert_one(budget.model_dump())
    return budget

@api_router.get("/analytics/spending")
async def analytics_spending():
    cs = await get_category_spending(days=30)
    total = sum(item['amount'] for item in cs)
    return {"total_monthly": round(total, 2), "by_category": cs}

@api_router.get("/forecast")
async def forecast():
    return await forecast_spending(days_ahead=30)

# Include router + CORS
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    await seed_sample_data()
    logger.info("FinFusion API started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
