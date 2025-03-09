from django.shortcuts import render, get_object_or_404, redirect
from django.utils import timezone
from .models import Journal


def index(request):
    journal_list = Journal.objects.order_by('-create_date')
    context = {'journal_list' : journal_list}
    return render(request, 'home/journal_list.html', context)

def detail(request, journal_id):
    journal = get_object_or_404(Journal, pk= journal_id)
    context = {'journal': journal}
    return render(request, 'home/journal_detail.html', context)

def comment_create(request, journal_id):
    journal = get_object_or_404(Journal, pk= journal_id)
    journal.comment_set.create(content=request.POST.get('content'), create_date =timezone.now())
    return redirect('home:detail', journal_id = journal_id)