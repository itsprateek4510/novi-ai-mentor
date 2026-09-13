from pydantic import BaseModel


class OnboardingStep(BaseModel):
    key: str
    label: str
    detail: str
    route: str
    done: bool


class OnboardingOut(BaseModel):
    steps: list[OnboardingStep]
    total: int
    done: int
    percent: int
    next_action: dict | None = None