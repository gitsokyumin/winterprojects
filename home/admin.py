from django.contrib import admin
from .models import Journal

class JournalAdmin(admin.ModelAdmin):
    search_fields = ['subject']

admin.site.register(Journal, JournalAdmin)